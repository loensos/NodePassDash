# NodePassDash 多用户改造技术方案

> 文档版本: v1.0
> 更新日期: 2026-08-02
> 状态: 进行中（基础架构已就绪，业务隔离待实现）

---

## 一、现状分析

### 1.1 架构概览

NodePassDash 是一个基于 Go (Gin + GORM) + React (Vite + TypeScript + HeroUI) 的单二进制 Web Dashboard，用于管理 NodePass 端点、隧道和服务。

- **后端**: Go 1.21+, Gin 框架, GORM ORM, SQLite/PostgreSQL 双数据库支持
- **前端**: React 18, Vite, TypeScript, HeroUI, i18n
- **部署**: 单二进制文件 + 嵌入式前端，支持 Docker/systemd

### 1.2 当前认证架构

当前系统为**单用户架构**：

| 组件 | 现状 |
|------|------|
| 用户存储 | `system_configs` 表硬编码 admin 账号 (username/password_hash) |
| JWT Claims | 已扩展 `userId`, `role` 字段（但未在业务中使用） |
| 数据隔离 | 无用户隔离，所有数据全局可见 |
| 会话管理 | `user_sessions` 表 + 内存缓存 |

### 1.3 已完成的多用户基础工作

经过代码审查，以下多用户基础组件**已经实现**：

| 文件 | 内容 | 状态 |
|------|------|------|
| `internal/models/user.go` | User, UserPasswordReset, UserAuditLog 模型 | ✅ 已完成 |
| `internal/auth/service.go` | RegisterUser, AuthenticateUserMulti, ListUsers 等方法 | ✅ 已完成 |
| `internal/middleware/tenant.go` | TenantMiddleware, GetTenantUserID, RequireAdmin | ✅ 已完成 |
| `internal/api/user.go` | 用户管理 API (注册/列表/更新/删除) | ✅ 已完成 |
| `internal/auth/jwt.go` | JWT Claims 包含 userId, role | ✅ 已完成 |
| `internal/router/router.go` | SetupUserRoutes 路由注册 | ✅ 已完成 |
| `internal/db/db.go` | AutoMigrate 创建 users 等表 | ✅ 已完成 |

### 1.4 待完成的工作

| 模块 | 缺失内容 |
|------|----------|
| 数据库迁移 | `migrateExistingAdminToUser` 函数未实现 |
| 业务表隔离 | endpoints, tunnels, services 等表未添加 user_id |
| 中间件集成 | TenantMiddleware 未在业务路由中启用 |
| API 过滤 | 各业务 API 未按 user_id 过滤数据 |
| 前端注册 | 登录页缺少注册入口 |
| 前端管理 | 缺少用户管理页面（仅管理员可见） |

---

## 二、改造目标

### 2.1 功能目标

1. **多用户注册/登录**: 支持新用户注册，管理员审批
2. **角色权限**: admin（管理员）和 viewer（普通用户）两种角色
3. **数据隔离**: 每个用户只能访问自己创建的数据
4. **审计日志**: 记录关键操作（登录、注册、数据变更）
5. **密码重置**: 支持通过邮箱/令牌重置密码

### 2.2 非功能目标

- 向后兼容：现有单用户数据自动迁移
- 性能影响：数据过滤在查询层完成，不引入额外开销
- 安全：防止越权访问，JWT 防篡改

---

## 三、数据库设计

### 3.1 新增/修改表结构

#### 3.1.1 用户相关表（已存在，需补全）

```sql
-- users 表（已创建，需补全字段）
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- user_password_resets 表（已创建）
CREATE TABLE user_password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- user_audit_logs 表（已创建）
CREATE TABLE user_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.1.2 业务表添加 user_id 字段

需要为以下表添加 `user_id` 字段用于数据隔离：

| 表名 | 新增字段 | 说明 |
|------|----------|------|
| endpoints | user_id INTEGER | 端点归属用户 |
| tunnels | user_id INTEGER | 隧道归属用户 |
| services | user_id INTEGER | 服务归属用户 |
| tunnel_operation_logs | user_id INTEGER | 操作日志归属用户 |
| groups | user_id INTEGER | 分组归属用户 |
| tunnel_groups | user_id INTEGER | 隧道分组关联 |

**注意**: `user_id` 字段允许为 NULL，兼容历史数据（迁移时填充为 admin 用户 ID）。

### 3.2 数据迁移策略

#### 3.2.1 现有数据迁移

```sql
-- 1. 创建默认 admin 用户（ID=1）
INSERT INTO users (username, password_hash, role, is_active)
SELECT 
    'nodepass',  -- 当前默认用户名
    (SELECT value FROM system_configs WHERE key = 'admin_password_hash'),
    'admin',
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1);

-- 2. 更新现有业务数据，关联到 admin 用户
UPDATE endpoints SET user_id = 1 WHERE user_id IS NULL;
UPDATE tunnels SET user_id = 1 WHERE user_id IS NULL;
UPDATE services SET user_id = 1 WHERE user_id IS NULL;
UPDATE groups SET user_id = 1 WHERE user_id IS NULL;
```

#### 3.2.2 GORM 迁移实现

需要在 `internal/db/db.go` 中实现 `migrateExistingAdminToUser` 函数：

```go
func migrateExistingAdminToUser(db *gorm.DB) error {
    // 检查是否已有用户
    var userCount int64
    db.Model(&models.User{}).Count(&userCount)
    if userCount > 0 {
        return nil // 已迁移
    }

    // 获取现有 admin 配置
    var adminUsername, adminPasswordHash string
    db.Model(&models.SystemConfig{}).Where("key = ?", "admin_username").First(&adminUsername)
    db.Model(&models.SystemConfig{}).Where("key = ?", "admin_password_hash").First(&adminPasswordHash)

    if adminUsername == "" {
        adminUsername = "nodepass" // 默认用户名
    }
    if adminPasswordHash == "" {
        return nil // 无配置，跳过
    }

    // 创建 admin 用户
    admin := models.User{
        Username:     adminUsername,
        PasswordHash: adminPasswordHash,
        Role:         models.UserRoleAdmin,
        IsActive:     true,
    }
    if err := db.Create(&admin).Error; err != nil {
        return err
    }

    // 迁移现有业务数据
    db.Model(&models.Endpoint{}).Where("user_id IS NULL").Update("user_id", admin.ID)
    db.Model(&models.Tunnel{}).Where("user_id IS NULL").Update("user_id", admin.ID)
    db.Model(&models.Services{}).Where("user_id IS NULL").Update("user_id", admin.ID)
    db.Model(&models.Group{}).Where("user_id IS NULL").Update("user_id", admin.ID)

    return nil
}
```

---

## 四、认证层改造

### 4.1 JWT Claims 扩展

当前 JWT Claims 已包含必要字段（`internal/auth/jwt.go`）：

```go
type JWTClaims struct {
    UserID   int64  `json:"userId"`
    Username string `json:"username"`
    Role     string `json:"role"`
    jwt.RegisteredClaims
}
```

**无需修改**。

### 4.2 登录流程改造

登录成功后返回完整用户信息：

```go
// 现有代码已支持
token, expiresAt, jti, err := h.authService.GenerateTokenWithUserID(req.Username, user.ID)
// 返回中包含 role, userId
response := map[string]interface{}{
    "token":    token,
    "role":     string(user.Role),
    "userId":   user.ID,
    // ...
}
```

### 4.3 注册流程

- 开放注册（默认允许）
- 可通过系统配置 `allow_registration` 关闭
- 新用户默认角色为 `viewer`
- 注册时记录审计日志

---

## 五、中间件改造

### 5.1 TenantMiddleware 集成

当前 `internal/middleware/tenant.go` 已实现，但**未在路由中启用**。需要在 `internal/router/router.go` 中集成：

```go
// 在 protectedGroup 中添加 TenantMiddleware
protectedGroup := apiGroup.Group("")
protectedGroup.Use(authMiddleware)
protectedGroup.Use(middleware.TenantMiddleware())  // 新增
{
    // 各业务路由...
}
```

### 5.2 数据过滤中间件

需要创建数据过滤中间件，自动为查询添加 `user_id` 条件：

```go
// internal/middleware/tenant_filter.go
func TenantDataFilter() gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, exists := middleware.GetTenantUserID(c)
        if !exists || userID == 0 {
            c.Next()
            return
        }
        
        // 管理员不受限制
        role, _ := middleware.GetTenantRole(c)
        if role == "admin" {
            c.Next()
            return
        }
        
        // 将 user_id 注入 context 供查询使用
        c.Set("filterUserID", userID)
        c.Next()
    }
}
```

---

## 六、API 层改造

### 6.1 需要添加 user_id 过滤的 API

| 模块 | 路由 | 过滤方式 |
|------|------|----------|
| Endpoints | GET /api/endpoints | WHERE user_id = ? |
| Endpoints | POST /api/endpoints | 默认 user_id = 当前用户 |
| Tunnels | GET /api/tunnels | WHERE user_id = ? |
| Tunnels | POST /api/tunnels | 默认 user_id = 当前用户 |
| Services | GET /api/services | WHERE user_id = ? |
| Groups | GET /api/groups | WHERE user_id = ? |
| Logs | GET /api/logs | WHERE user_id = ? |

### 6.2 查询改造示例

以 endpoints 查询为例：

```go
// 现有代码
db.Find(&endpoints)

// 改造后
userID, exists := middleware.GetTenantUserID(c)
if exists && !middleware.IsAdmin(c) {
    db.Where("user_id = ?", userID).Find(&endpoints)
} else {
    db.Find(&endpoints)
}
```

---

## 七、前端改造

### 7.1 登录页增加注册入口

修改 `web/src/pages/login/index.tsx`：

1. 添加「注册账号」链接
2. 点击后展开注册表单（或跳转到注册页）
3. 注册成功后自动登录

### 7.2 新增用户管理页面

创建 `web/src/pages/admin/users/index.tsx`：

- 仅管理员可访问
- 用户列表（用户名、角色、状态、创建时间）
- 用户操作（启用/禁用、修改角色、删除）
- 审计日志查看

### 7.3 导航栏集成

在导航栏添加「用户管理」入口（仅管理员可见）：

```tsx
// web/src/components/layout/navbar-user.tsx
{user?.role === 'admin' && (
  <Link to="/admin/users">用户管理</Link>
)}
```

### 7.4 路由守卫

添加管理员路由守卫：

```tsx
// web/src/components/auth/route-guard.tsx
export function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return <Navigate to="/" />;
  }
  return children;
}
```

---

## 八、实施计划

### 阶段一：数据库层（预计 2 天）

| 任务 | 文件 | 描述 |
|------|------|------|
| 实现迁移函数 | `internal/db/db.go` | 完成 `migrateExistingAdminToUser` |
| 添加 user_id 字段 | `internal/models/*.go` | endpoints, tunnels, services, groups 等表 |
| 数据库迁移测试 | - | 验证新旧数据兼容 |

### 阶段二：后端 API（预计 3 天）

| 任务 | 文件 | 描述 |
|------|------|------|
| 集成 TenantMiddleware | `internal/router/router.go` | 在业务路由中启用 |
| 改造查询逻辑 | `internal/api/*.go` | 各业务 API 添加 user_id 过滤 |
| 注册/登录测试 | - | 验证多用户流程 |

### 阶段三：前端改造（预计 3 天）

| 任务 | 文件 | 描述 |
|------|------|------|
| 登录页注册入口 | `web/src/pages/login/index.tsx` | 添加注册功能 |
| 用户管理页面 | `web/src/pages/admin/users/` | 新建管理页面 |
| 路由守卫 | `web/src/components/auth/` | 添加管理员权限检查 |
| 导航栏集成 | `web/src/components/layout/` | 管理员菜单 |

### 阶段四：测试与优化（预计 2 天）

| 任务 | 描述 |
|------|------|
| 单元测试 | 各模块 API 测试 |
| 集成测试 | 端到端流程测试 |
| 性能测试 | 数据隔离查询性能 |
| 安全审计 | 权限绕过检查 |

---

## 九、风险与注意事项

### 9.1 向后兼容

- 现有单用户数据通过迁移脚本自动关联到 admin 用户
- `user_id` 字段允许 NULL，避免破坏现有查询
- 提供降级开关，可临时禁用多用户功能

### 9.2 性能影响

- 数据过滤在 SQL 层完成，无需应用层后处理
- 为 `user_id` 字段添加索引以优化查询
- SQLite 场景下注意写锁竞争

### 9.3 安全风险

- 严格验证管理员权限，防止越权访问
- JWT 密钥定期轮换
- 审计日志防篡改（考虑添加签名）

---

## 十、附录

### 10.1 相关代码文件

| 文件路径 | 说明 |
|----------|------|
| `internal/models/user.go` | 用户相关模型定义 |
| `internal/auth/service.go` | 认证服务（含多用户方法） |
| `internal/auth/jwt.go` | JWT token 生成与验证 |
| `internal/middleware/tenant.go` | 租户中间件 |
| `internal/api/user.go` | 用户管理 API |
| `internal/router/router.go` | 路由注册 |
| `internal/db/db.go` | 数据库迁移 |
| `web/src/pages/login/index.tsx` | 登录页面 |
| `web/src/components/auth/` | 认证相关组件 |

### 10.2 API 接口清单

#### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |
| POST | /api/users/register | 用户注册 |
| GET | /api/auth/oauth2 | 获取 OAuth2 配置 |

#### 受保护接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/users/me | 所有用户 | 获取当前用户信息 |
| POST | /api/users/change-password | 所有用户 | 修改密码 |
| GET | /api/users | 管理员 | 用户列表 |
| PUT | /api/users/:id | 管理员 | 更新用户 |
| DELETE | /api/users/:id | 管理员 | 删除用户 |

---

## 十一、待确认事项

1. **注册策略**: 是否开放公开注册，还是仅管理员可创建账号？
2. **密码重置**: 是否需要邮箱验证码，还是仅通过管理后台重置？
3. **数据共享**: 是否需要支持用户间共享特定数据（如隧道）？
4. **配额限制**: 是否需要限制每用户的端点/隧道数量？

---

*本文档由 Agnes (Sapiens AI) 基于代码分析生成*
