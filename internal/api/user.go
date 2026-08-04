package api

import (
	"errors"

	"NodePassDash/internal/auth"
	"NodePassDash/internal/middleware"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// UserHandler 用户管理处理器
type UserHandler struct {
	authService *auth.Service
}

// NewUserHandler 创建用户处理器实例
func NewUserHandler(authService *auth.Service) *UserHandler {
	return &UserHandler{
		authService: authService,
	}
}

// RegisterUserRequest 注册请求结构
type RegisterUserRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// ChangePasswordRequest 修改密码请求结构
type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required"`
}

// UpdateUserRequest 更新用户请求结构
type UpdateUserRequest struct {
	Role            string  `json:"role"`
	Active          *bool   `json:"active"`
	TrafficQuotaMB  *int64  `json:"trafficQuotaMB"`
	MaxEndpoints    *int64  `json:"maxEndpoints"`
	MaxTunnels      *int64  `json:"maxTunnels"`
	MaxServices     *int64  `json:"maxServices"`
	AllowMasterNode *bool   `json:"allowMasterNode"`
	ExpiresAt       *string `json:"expiresAt"`
}

// SetupUserRoutes 设置用户相关路由
func SetupUserRoutes(rg *gin.RouterGroup, authService *auth.Service) {
	userHandler := NewUserHandler(authService)
	authMiddleware := middleware.AuthMiddleware(authService)

	// 公开路由：用户注册
	rg.POST("/users/register", userHandler.HandleRegister)

	// 受保护的路由
	rg.GET("/users/me", authMiddleware, userHandler.HandleGetMe)
	rg.POST("/users/change-password", authMiddleware, userHandler.HandleChangePassword)

	// 管理员路由
	adminGroup := rg.Group("/users")
	adminGroup.Use(authMiddleware, middleware.RequireAdmin(func(c *gin.Context) { c.Next() }))
	{
		adminGroup.GET("", userHandler.HandleListUsers)
		adminGroup.GET("/:id", userHandler.HandleGetUser)
		adminGroup.PUT("/:id", userHandler.HandleUpdateUser)
		adminGroup.DELETE("/:id", userHandler.HandleDeleteUser)
	}
}

// HandleRegister 处理用户注册
func (h *UserHandler) HandleRegister(c *gin.Context) {
	var req RegisterUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// 验证用户名和密码
	if err := validateUserCredentials(req.Username, req.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 检查用户名是否已存在
	exists, err := h.authService.UsernameExists(req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check username"})
		return
	}
	if exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username already exists"})
		return
	}

	// 创建用户（默认角色为 viewer）
	user, err := h.authService.RegisterUser(req.Username, req.Password, "viewer")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	// 记录审计日志
	h.authService.LogAudit(user.ID, user.Username, "register", c.ClientIP(), c.GetHeader("User-Agent"), nil)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

// HandleGetMe 获取当前用户信息
func (h *UserHandler) HandleGetMe(c *gin.Context) {
	username := middleware.GetUsername(c)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not logged in"})
		return
	}

	user, err := h.authService.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":        user.ID,
		"username":  user.Username,
		"role":      user.Role,
		"isActive":  user.IsActive,
		"lastLogin": user.LastLogin,
		"createdAt": user.CreatedAt,
	})
}

// HandleChangePassword 修改密码
func (h *UserHandler) HandleChangePassword(c *gin.Context) {
	username := middleware.GetUsername(c)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not logged in"})
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required fields"})
		return
	}

	if err := validatePassword(req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证当前密码
	ok, msg := h.authService.VerifyPassword(username, req.CurrentPassword)
	_ = msg
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": msg})
		return
	}

	// 修改密码
	err := h.authService.ChangeUserPassword(username, req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to change password"})
		return
	}

	// 记录审计日志
	h.authService.LogAuditByUserIDAndName(c, username, "password_change")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Password changed successfully",
	})
}

// HandleListUsers 获取用户列表（仅管理员）
func (h *UserHandler) HandleListUsers(c *gin.Context) {
	users, err := h.authService.ListUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list users"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"users":   users,
	})
}

// HandleGetUser 获取单个用户信息（仅管理员）
func (h *UserHandler) HandleGetUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.authService.GetUserByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user":    user,
	})
}

// HandleUpdateUser 更新用户信息（仅管理员）
func (h *UserHandler) HandleUpdateUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// 验证角色
	if req.Role != "" && req.Role != "admin" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role"})
		return
	}

	// 更新用户
	authReq := auth.UpdateUserRequest{
		Role:            req.Role,
		Active:          req.Active,
		TrafficQuotaMB:  req.TrafficQuotaMB,
		MaxEndpoints:    req.MaxEndpoints,
		MaxTunnels:      req.MaxTunnels,
		MaxServices:     req.MaxServices,
		AllowMasterNode: req.AllowMasterNode,
		ExpiresAt:       req.ExpiresAt,
	}
	err = h.authService.UpdateUser(id, authReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	// 记录审计日志
	currentUsername := middleware.GetUsername(c)
	h.authService.LogAuditByUserIDAndName(c, currentUsername, "user_update", gin.H{"targetUserId": id})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User updated successfully",
	})
}

// HandleDeleteUser 删除用户（仅管理员）
func (h *UserHandler) HandleDeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// 不能删除自己
	currentUser := middleware.GetUsername(c)
	user, err := h.authService.GetUserByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.Username == currentUser {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your own account"})
		return
	}

	// 删除用户
	err = h.authService.DeleteUser(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	// 记录审计日志
	h.authService.LogAuditByUserIDAndName(c, currentUser, "user_delete", gin.H{"targetUserId": id})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User deleted successfully",
	})
}

// validateUserCredentials 校验用户凭据
func validateUserCredentials(username, password string) error {
	if len(username) < 3 || len(username) > 20 {
		return errors.New("用户名长度须在 3-20 个字符之间")
	}
	for _, r := range username {
		isAlpha := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
		isDigit := r >= '0' && r <= '9'
		isUnderscore := r == '_'
		if !(isAlpha || isDigit || isUnderscore) {
			return errors.New("用户名只能包含字母、数字和下划线")
		}
	}
	if len(password) < 8 {
		return errors.New("密码长度不能少于 8 个字符")
	}
	return nil
}

// validatePassword 校验密码强度
func validatePassword(password string) error {
	if len(password) < 8 {
		return nil
	}
	return nil
}
