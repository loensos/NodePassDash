import { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardBody,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Tooltip,
  Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faTrash, faCrown, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react/dist/offline";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

import { apiGet, apiPut, apiDelete } from "@/lib/api-client";
import { buildApiUrl } from "@/lib/utils";

interface User {
  id: number;
  username: string;
  role: "admin" | "viewer";
  isActive: boolean;
  createdAt: string;
  lastLogin: string;
}

export default function UserManagementPage() {
  const { t } = useTranslation("user");
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const {
    isOpen: isResetOpen,
    onOpen: onResetOpen,
    onOpenChange: onResetOpenChange,
    onClose: onResetClose,
  } = useDisclosure();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await apiGet("/api/users");
      const data = await response.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("获取用户列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleRole = async (user: User) => {
    const newRole = user.role === "admin" ? "viewer" : "admin";
    try {
      const response = await apiPut(`/api/users/${user.id}`, {
        role: newRole,
      });
      const data = await response.json();
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
        );
        addToast({
          title: t("userManagement.toast.updateSuccess"),
          color: "success",
        });
      }
    } catch (error) {
      addToast({
        title: t("userManagement.toast.updateFailed"),
        color: "danger",
      });
    }
  };

  const handleToggleActive = async (user: User) => {
    const newActive = !user.isActive;
    try {
      const response = await apiPut(`/api/users/${user.id}`, {
        active: newActive,
      });
      const data = await response.json();
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isActive: newActive } : u))
        );
      }
    } catch (error) {
      addToast({
        title: t("userManagement.toast.updateFailed"),
        color: "danger",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      const response = await apiDelete(`/api/users/${deletingUser.id}`);
      const data = await response.json();
      if (data.success) {
        setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
        addToast({
          title: t("userManagement.toast.deleteSuccess"),
          color: "success",
        });
      }
    } catch (error) {
      addToast({
        title: t("userManagement.toast.deleteFailed"),
        color: "danger",
      });
    } finally {
      onClose();
      setDeletingUser(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser || !resetPassword) return;
    setIsResetSubmitting(true);
    try {
      const response = await fetch(buildApiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resettingUser.username, password: resetPassword }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast({
          title: "密码重置成功",
          description: `用户 ${resettingUser.username} 的密码已重置`,
          color: "success",
        });
        onResetClose();
        setResettingUser(null);
        setResetPassword("");
      } else {
        addToast({
          title: "密码重置失败",
          description: data.error || t("userManagement.toast.updateFailed"),
          color: "danger",
        });
      }
    } catch (error) {
      addToast({
        title: t("userManagement.toast.networkError"),
        color: "danger",
      });
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("userManagement.title")}
          </h1>
          <p className="text-small text-default-500">
            {t("userManagement.subtitle")}
          </p>
        </div>
        <Button
          color="primary"
          size="sm"
          startContent={<Icon icon="solar:refresh-linear" width={18} />}
          onPress={fetchUsers}
        >
          {t("common.action.refresh")}
        </Button>
      </div>

      <Card>
        <CardBody>
          <Table
            aria-label={t("userManagement.title")}
            removeWrapper
            classNames={{
              base: "overflow-visible gap-4",
              wrapper: "p-0",
            }}
          >
            <TableHeader>
              <TableColumn>{t("userManagement.username")}</TableColumn>
              <TableColumn>{t("userManagement.role")}</TableColumn>
              <TableColumn>{t("userManagement.active")}</TableColumn>
              <TableColumn>{t("userManagement.createdAt")}</TableColumn>
              <TableColumn>{t("common.actions")}</TableColumn>
            </TableHeader>
            <TableBody emptyContent={t("userManagement.noUsers")}>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon
                        className="text-default-400"
                        icon="solar:user-bold"
                        width={18}
                      />
                      <span className="font-medium">{user.username}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip
                      color={user.role === "admin" ? "primary" : "default"}
                      size="sm"
                      variant="flat"
                    >
                      {user.role === "admin"
                        ? t("userManagement.admin")
                        : t("userManagement.viewer")}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      color={user.isActive ? "success" : "danger"}
                      size="sm"
                      variant="flat"
                    >
                      {user.isActive
                        ? t("common.status.active")
                        : t("common.status.inactive")}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-default-500 text-small">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Tooltip content={t("userManagement.setAdmin")}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleToggleRole(user)}
                        >
                          <Icon
                            className={
                              user.role === "admin"
                                ? "text-warning"
                                : "text-default-400"
                            }
                            icon="solar:crown-bold"
                            width={16}
                          />
                        </Button>
                      </Tooltip>
                      <Tooltip
                        content={
                          user.isActive
                            ? t("userManagement.disable")
                            : t("userManagement.enable")
                        }
                      >
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleToggleActive(user)}
                        >
                          <Icon
                            className={
                              user.isActive ? "text-success" : "text-warning"
                            }
                            icon={
                              user.isActive
                                ? "solar:eye-bold"
                                : "solar:eye-closed-bold"
                            }
                            width={16}
                          />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t("userManagement.resetPassword")}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="warning"
                          onPress={() => {
                            setResettingUser(user);
                            onResetOpen();
                          }}
                        >
                          <FontAwesomeIcon icon={faKey} width={16} />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t("userManagement.delete")}>
                        <Button
                          isIconOnly
                          isDisabled={user.username === "admin"}
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={() => {
                            setDeletingUser(user);
                            onOpen();
                          }}
                        >
                          <Icon icon="solar:trash-bin-bold" width={16} />
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* 删除确认弹窗 */}
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="sm"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {t("userManagement.delete")}
              </ModalHeader>
              <ModalBody>
                <p>
                  {t("userManagement.deleteConfirm", {
                    username: deletingUser?.username,
                  })}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  {t("common.action.cancel")}
                </Button>
                <Button
                  color="danger"
                  isLoading={false}
                  onPress={handleDelete}
                >
                  {t("common.action.confirm")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        backdrop="blur"
        isOpen={isResetOpen}
        onOpenChange={onResetOpenChange}
        size="sm"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {t("userManagement.resetPassword")}
              </ModalHeader>
              <ModalBody>
                <p className="text-default-500 text-small">
                  为 <strong>{resettingUser?.username}</strong> 设置新密码
                </p>
                <Input
                  label="新密码"
                  placeholder="至少8位"
                  type="password"
                  value={resetPassword}
                  variant="bordered"
                  endContent={
                    <FontAwesomeIcon icon={faKey} className="text-default-400" width={16} />
                  }
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <p className="text-small text-default-400">
                  密码重置后将立即生效，用户下次登录时使用新密码。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onResetClose}>
                  {t("common.action.cancel")}
                </Button>
                <Button
                  color="warning"
                  isDisabled={resetPassword.length < 8}
                  isLoading={isResetSubmitting}
                  onPress={handleResetPassword}
                >
                  {isResetSubmitting ? "重置中..." : "确认重置"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
