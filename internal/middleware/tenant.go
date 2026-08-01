package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// TenantMiddleware 多用户数据隔离中间件
// 从 JWT context 中提取 userId，并将其注入到 Gin context 中供查询使用
func TenantMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从 context 中获取用户信息
		userID, existsID := c.Get("userId")
		username, existsName := c.Get("username")
		role, existsRole := c.Get("role")

		// 如果没有用户信息，继续处理（可能在其他中间件之后使用）
		if !existsID {
			c.Next()
			return
		}

		// 将 tenant 信息注入到 context
		c.Set("tenantUserId", userID)
		c.Set("tenantUsername", username)
		c.Set("tenantRole", role)

		c.Next()
	}
}

// GetTenantUserID 从 Gin context 中获取当前租户用户 ID
func GetTenantUserID(c *gin.Context) (int64, bool) {
	v, exists := c.Get("tenantUserId")
	if !exists {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}

// GetTenantUsername 从 Gin context 中获取当前租户用户名
func GetTenantUsername(c *gin.Context) (string, bool) {
	v, exists := c.Get("tenantUsername")
	if !exists {
		return "", false
	}
	username, ok := v.(string)
	return username, ok
}

// GetTenantRole 从 Gin context 中获取当前租户角色
func GetTenantRole(c *gin.Context) (string, bool) {
	v, exists := c.Get("tenantRole")
	if !exists {
		return "", false
	}
	role, ok := v.(string)
	return role, ok
}

// RequireAdmin 检查当前用户是否是管理员
func RequireAdmin(next gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := GetTenantRole(c)
		if !exists || role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "admin privileges required",
			})
			c.Abort()
			return
		}
		next(c)
	}
}

// IsAdmin 检查当前请求是否来自管理员
func IsAdmin(c *gin.Context) bool {
	role, exists := GetTenantRole(c)
	return exists && role == "admin"
}
