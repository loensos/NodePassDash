# NodePassDash 多用户改造技术方案

> 文档版本: v2.0
> 更新日期: 2026-08-04
> 状态: **后端已完成，前端已完成，部分边界场景待优化**

---

## 一、架构概览

NodePassDash 是一个基于 Go (Gin + GORM) + React (Vite + TypeScript + HeroUI) 的单二进制 Web Dashboard，用于管理 NodePass 端点、隧道和服务。

- **后端**: Go 1.21+, Gin 框架, GORM ORM, SQLite/PostgreSQL 双数据库支持
- **前端**: React 18, Vite, TypeScript, HeroUI, i18n
- **部署**: 单二进制文件 + 嵌入式前端，支持 Docker/systemd
- **认证模式**: JWT Bearer Token，支持多用户 + 角色权限 + 数据隔离

---

## 二、已完成功能清单

### 2.1 数据库层（已完成）

| 模型 | 文件 | 状态 |
|------|------|------|
| User | `internal/models/user.go` | ✅ 已完成 |
| UserPasswordReset | `internal/models/user.go` | ✅ 已完成 |
| UserAuditLog | `internal/models/user.go` | ✅ 已完成 |
| OAuthUser | `internal/models/models.go` | ✅ 已完成 |
| Endpoint.user_id | `internal/models/models.go` | ✅ 已添加 |
| Tunnel.user_id | `internal/models/models.go` | ✅ 已添加 |
| Services.user_id | `internal/models/models.go` | ✅ 已添加 |
| Group.user_id | `internal/models/models.go` | ✅ 已添加 |
| TunnelGroup.user_id | `internal/models/models.go` | ✅ 已添加 |
| TunnelOperationLog.user_id | `internal/models/models.go` | ✅ 已添加 |

### 2.2 认证层（已完成）

| 组件 | 文件 | 状态 |
|------|------|------|
| JWT Claims（含 userId, role） | `internal/auth/jwt.go` | ✅ 已完成 |
| JWT 验证中间件 | `internal/middleware/auth.go` | ✅ 已完成 |
| Tenant 数据隔离中间件 | `internal/middleware/tenant.go` | ✅ 已完成 |
| 注册/登录/管理 API | `internal/api/user.go` | ✅ 已完成 |
| 多用户登录验证 | `internal/auth/service.go` | ✅ 已完成 |
| 自动迁移函数 | `internal/db/db.go` | ✅ 已完成 |

### 2.3 业务 API 层数据隔离（已完成）

| 模块 | 路由 | 隔离方式 | 状态 |
|------|------|----------|------|
| Endpoints | GET /api/endpoints | WHERE user_id = ?（非 admin） | ✅ |
| Endpoints | POST /api/endpoints | 自动设置 user_id = 当前用户 | ✅ |
| Endpoints | DELETE /api/endpoints/:id | 所有权校验（非 admin 只能删自己的） | ✅ |
| Tunnels | GET /api/tunnels | WHERE user_id = ?（非 admin） | ✅ |
| Tunnels | DELETE /api/tunnels/:id | 所有权校验（非 admin 只能删自己的） | ✅ |
| Services | GET /api/services | WHERE user_id = ?（非 admin） | ✅ |
| Groups | GET /api/groups | WHERE user_id = ?（非 admin） | ✅ |
| Groups | POST /api/groups | 自动设置 user_id = 当前用户 | ✅ |
| Groups | PUT/PATCH /api/groups/:id | 所有权校验 | ✅ |

### 2.4 前端（已完成）

| 页面/组件 | 文件 | 状态 |
|-----------|------|------|
| 登录页 | `web/src/pages/login/index.tsx` | ✅ 已完成（含注册跳转链接） |
| 注册页 | `web/src/pages/register/index.tsx` | ✅ 已完成 |
| 用户管理页 | `web/src/pages/settings/user-management/index.tsx` | ✅ 已完成（仅管理员） |
| 认证 Provider | `web/src/components/auth/auth-provider.tsx` | ✅ 已完成 |
| 路由守卫 | `web/src/components/auth/route-guard.tsx` | ✅ 已完成 |
| 用户菜单（含管理入口） | `web/src/components/layout/navbar-user.tsx` | ✅ 已完成（仅管理员可见） |
| 路由配置 | `web/src/App.tsx` | ✅ 已完成 |

### 2.5 路由集成（已完成）

```
/api/auth/login              → POST（公开）
/api/users/register          → POST（公开）
/api/auth/logout             → POST（受保护）
/api/users/me                → GET（受保护）
/api/users/change-password   → POST（受保护）
/api/users                   → GET（管理员）
/api/users/:id               → PUT/DELETE（管理员）
/api/endpoints               → GET/POST/PUT/DELETE（租户隔离）
/api/tunnels                 → GET/POST/DELETE（租户隔离）
/api/services                → GET（租户隔离）
/api/groups                  → GET/POST（租户隔离）
```

路由注册位于 `internal/router/router.go`：
```go
protectedGroup := apiGroup.Group("")
protectedGroup.Use(authMiddleware)
protectedGroup.Use(middleware.TenantMiddleware())
```

---

## 三、数据库设计

### 3.1 用户相关表

```sql
-- users 表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',       -- 'admin' | 'viewer'
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- user_password_resets 表（密码重置令牌，暂未接入前端流程）
CREATE TABLE user_password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- user_audit_logs 表（审计日志）
CREATE TABLE user_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,             -- login/logout/register/password_change/role_change/delete
    ip_address TEXT,
    user_agent TEXT,
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 业务表 user_id 字段

| 表名 | 字段 | 说明 |
|------|------|------|
| endpoints | user_id INTEGER NULL | 端点归属用户 |
| tunnels | user_id INTEGER NULL | 隧道归属用户 |
| services | user_id INTEGER NULL | 服务归属用户 |
| groups | user_id INTEGER NULL | 分组归属用户 |
| tunnel_groups | user_id INTEGER NULL | 隧道分组关联 |
| tunnel_operation_logs | user_id INTEGER NULL | 操作日志归属用户 |

所有 `user_id` 字段允许为 NULL，兼容历史数据。

### 3.3 数据迁移策略

`migrateExistingAdminToUser` 函数在 `internal/db/db.go` 中实现，自动执行：

```sql
-- 1. 从 system_configs 读取现有 admin 凭据
-- 2. 创建 admin 用户（ID=1，role='admin'）
-- 3. 将现有业务数据关联到该 admin 用户
UPDATE endpoints SET user_id = 1 WHERE user_id IS NULL;
UPDATE tunnels SET user_id = 1 WHERE user_id IS NULL;
UPDATE services SET user_id = 1 WHERE user_id IS NULL;
UPDATE groups SET user_id = 1 WHERE user_id IS NULL;
UPDATE tunnel_operation_logs SET user_id = 1 WHERE user_id IS NULL;
UPDATE tunnel_groups SET user_id = 1 WHERE user_id IS NULL;
```

幂等设计：检查 users 表非空即跳过迁移。

---

## 四、认证流程

### 4.1 登录流程

```
用户提交用户名/密码
    ↓
POST /api/auth/login
    ↓
AuthenticateUserMulti() 验证用户（支持多用户）
    ↓
GenerateTokenWithUserID() 生成 JWT（含 userId, role, jti）
    ↓
SetCurrentUserJTI() 记录有效 JTI（实现 token 互踢）
    ↓
LogAudit() 记录登录审计日志
    ↓
返回 { token, role, userId, expiresAt }
```

### 4.2 Token 互踢机制

- 每次登录生成新的 JTI（JWT ID），存入内存
- JWT 验证时比对当前 JTI，不匹配则拒绝（被踢出）
- 登出时清除 JTI，使所有 token 失效
- 服务重启后 JTI 清空，所有 token 失效

### 4.3 注册流程

```
POST /api/users/register
    ↓
validateUserCredentials() 校验用户名/密码格式
    ↓
UsernameExists() 检查用户名唯一性
    ↓
RegisterUser() 创建用户（默认 role='viewer'）
    ↓
LogAudit() 记录注册审计日志
    ↓
返回 { success: true, user: { id, username, role } }
```

注册后跳转登录页，需手动登录。

---

## 五、数据隔离机制

### 5.1 中间件链

```
请求 → AuthMiddleware（验证 JWT，注入 userId/username/role）
     → TenantMiddleware（注入 tenantUserId/tenantUsername/tenantRole）
     → 业务 Handler
```

### 5.2 查询过滤规则

| 用户角色 | 查询行为 |
|----------|----------|
| admin | 返回所有数据（无 user_id 过滤） |
| viewer | 仅返回 user_id = 当前用户 ID 的数据 |

### 5.3 关键代码模式

```go
// 示例：端点列表查询
userID, isTenant := middleware.GetTenantUserID(c)
isAdmin := middleware.IsAdmin(c)

if isTenant && !isAdmin {
    // 普通用户：只查自己的数据
    endpoints, err = h.endpointService.GetEndpointsByUserID(userID)
} else {
    // 管理员：查全部
    endpoints, err = h.endpointService.GetEndpoints()
}
```

### 5.4 写入时自动绑定

```go
// 示例：创建端点时自动设置 user_id
userID, _ := middleware.GetTenantUserID(c)
if userID > 0 {
    req.UserID = &userID
}
```

---

## 六、待优化项

以下功能已具备基础框架，但仍有优化空间：

### 6.1 密码重置流程

- 后端 `UserPasswordReset` 模型已存在
- `auth/service.go` 缺少生成重置令牌和验证令牌的方法
- 前端暂无密码重置页面入口
- **建议**：后续补充基于 token 的密码重置流程（无需邮箱）

### 6.2 Tunnel 创建时 user_id 绑定

- `HandleCreateTunnel1` 创建隧道时未显式设置 user_id
- 后端 `models.Tunnel` 已有 `UserID` 字段
- **建议**：在创建隧道时自动绑定当前用户 ID

### 6.3 Services 创建时 user_id 绑定

- 服务创建接口需确认是否自动绑定当前用户
- **建议**：补充创建时的 user_id 绑定逻辑

### 6.4 OAuth2 多用户支持

- OAuth2 登录当前仅支持绑定到第一个 OAuth 用户（`OAuthUser` 表限制）
- 多用户场景下不同用户应支持不同的 OAuth 绑定
- **建议**：后续将 OAuth 绑定关系改为 per-user 存储

### 6.5 前端缺少全局 loading 状态同步

- `auth-provider.tsx` 的 checkAuth 仅做本地缓存校验
- 未定期调用 `/api/auth/me` 刷新角色信息
- **建议**：页面切换时同步用户角色，用于动态菜单渲染

---

## 七、风险与注意事项

### 7.1 向后兼容

- 现有单用户数据通过 `migrateExistingAdminToUser` 自动关联到 admin 用户
- `user_id` 字段允许 NULL，不影响现有查询逻辑
- 升级后无需手动迁移数据

### 7.2 性能影响

- 数据过滤在 SQL 层完成（`WHERE user_id = ?`），无额外应用层开销
- 建议为业务表的 `user_id` 字段添加索引（GORM 已通过 `gorm:"index"` 声明）
- SQLite 场景下写锁竞争风险较低（单写者模型）

### 7.3 安全注意事项

- JWT 密钥默认每次启动随机生成，重启后所有 token 失效
- 生产环境建议通过 `JWT_SECRET` 环境变量固定密钥
- 已实现 token 互踢机制（同一用户新登录踢掉旧会话）
- 管理员操作需通过 `RequireAdmin` 中间件校验角色

---

## 八、API 接口清单

### 公开接口（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |
| POST | /api/users/register | 用户注册 |
| GET | /api/auth/oauth2 | 获取 OAuth2 配置 |
| GET | /api/oauth2/callback | OAuth2 回调 |

### 受保护接口（需 JWT）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/users/me | 所有用户 | 获取当前用户信息 |
| POST | /api/users/change-password | 所有用户 | 修改密码 |
| GET | /api/users | 管理员 | 用户列表 |
| GET | /api/users/:id | 管理员 | 获取单个用户 |
| PUT | /api/users/:id | 管理员 | 更新用户（角色/状态） |
| DELETE | /api/users/:id | 管理员 | 删除用户 |
| POST | /api/auth/reset-password | 管理员 | 管理员重置用户密码 |

### 租户隔离接口

| 方法 | 路径 | 隔离说明 |
|------|------|----------|
| GET/POST/PUT/DELETE | /api/endpoints/* | viewer 仅见自己的端点 |
| GET/POST/DELETE | /api/tunnels/* | viewer 仅见自己的隧道 |
| GET | /api/services | viewer 仅见自己的服务 |
| GET/POST/PUT/DELETE | /api/groups/* | viewer 仅见自己的分组 |

---

## 九、核心文件索引

| 文件路径 | 说明 |
|----------|------|
| `internal/models/user.go` | 用户模型定义 |
| `internal/models/models.go` | 业务模型（含 user_id 字段） |
| `internal/auth/jwt.go` | JWT 生成与验证 |
| `internal/auth/service.go` | 认证服务（含多用户方法） |
| `internal/middleware/auth.go` | JWT 认证中间件 |
| `internal/middleware/tenant.go` | 租户隔离中间件 |
| `internal/api/user.go` | 用户管理 API |
| `internal/api/endpoint.go` | 端点 API（含租户过滤） |
| `internal/api/tunnel.go` | 隧道 API（含租户过滤） |
| `internal/api/services.go` | 服务 API（含租户过滤） |
| `internal/api/group.go` | 分组 API（含租户过滤） |
| `internal/router/router.go` | 路由注册（含中间件链） |
| `internal/db/db.go` | 数据库迁移（含 admin 迁移） |
| `web/src/pages/login/index.tsx` | 登录页 |
| `web/src/pages/register/index.tsx` | 注册页 |
| `web/src/pages/settings/user-management/index.tsx` | 用户管理页 |
| `web/src/components/auth/auth-provider.tsx` | 认证上下文 |
| `web/src/components/auth/route-guard.tsx` | 路由守卫 |
| `web/src/components/layout/navbar-user.tsx` | 用户菜单（含管理员入口） |

---

## 十、后续规划建议

1. **完善密码重置**: 基于现有 `UserPasswordReset` 模型实现前端重置流程
2. **创建时自动绑定**: 确保 Tunnel/Services 创建时自动设置 user_id
3. **OAuth2 多用户**: 将 OAuth 绑定从全局改为 per-user
4. **配额管理**: 考虑为 viewer 用户设置端点/隧道数量上限
5. **数据共享**: 如需支持用户间共享数据，可添加共享关系表

---

*本文档基于代码实际状态更新，v2.0 反映 2026-08-04 时的实现进度*
