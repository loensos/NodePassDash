package models

import "time"

// UserRole 用户角色枚举
type UserRole string

const (
	UserRoleAdmin  UserRole = "admin"
	UserRoleViewer UserRole = "viewer"
)

// User 用户表 - GORM模型
type User struct {
	ID           int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Username     string    `json:"username" gorm:"type:text;uniqueIndex;not null;column:username"`
	PasswordHash string    `json:"-" gorm:"type:text;not null;column:password_hash"`
	Role         UserRole  `json:"role" gorm:"type:text;default:'viewer';column:role"`
	IsActive     bool      `json:"isActive" gorm:"default:true;column:is_active"`
	LastLogin    time.Time `json:"lastLogin" gorm:"column:last_login"`
	CreatedAt    time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt    time.Time `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`
}

// TableName 设置表名
func (User) TableName() string {
	return "users"
}

// UserPasswordReset 密码重置令牌表 - GORM模型
type UserPasswordReset struct {
	ID        int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	UserID    int64     `json:"userId" gorm:"not null;index;column:user_id"`
	Token     string    `json:"-" gorm:"type:text;uniqueIndex;not null;column:token"`
	ExpiresAt time.Time `json:"expiresAt" gorm:"not null;column:expires_at"`
	Used      bool      `json:"used" gorm:"default:false;column:used"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
}

// TableName 设置表名
func (UserPasswordReset) TableName() string {
	return "user_password_resets"
}

// UserAuditLog 用户审计日志表 - GORM模型
type UserAuditLog struct {
	ID         int64          `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	UserID     int64          `json:"userId" gorm:"index;column:user_id"`
	Username   string         `json:"username" gorm:"type:text;not null;column:username"`
	Action     AuditAction    `json:"action" gorm:"type:text;not null;index;column:action"`
	IPAddress  string         `json:"ipAddress" gorm:"type:text;column:ip_address"`
	UserAgent  string         `json:"userAgent" gorm:"type:text;column:user_agent"`
	Detail     *string        `json:"detail,omitempty" gorm:"type:text;column:detail"`
	CreatedAt  time.Time      `json:"createdAt" gorm:"autoCreateTime;index;column:created_at"`
}

// TableName 设置表名
func (UserAuditLog) TableName() string {
	return "user_audit_logs"
}

// AuditAction 审计操作类型枚举
type AuditAction string

const (
	AuditActionLogin          AuditAction = "login"
	AuditActionLogout         AuditAction = "logout"
	AuditActionRegister       AuditAction = "register"
	AuditActionPasswordChange AuditAction = "password_change"
	AuditActionRoleChange     AuditAction = "role_change"
	AuditActionStatusChange   AuditAction = "status_change"
	AuditActionDelete         AuditAction = "delete"
)
