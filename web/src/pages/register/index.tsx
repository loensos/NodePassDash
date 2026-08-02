import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Divider,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLock,
  faUser,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react/dist/offline";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";
import Image from "@/components/common/image";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import { Footer } from "@/components/layout/footer";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("user");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const logoSrc = isDark ? "/nodepass-logo-3.svg" : "/nodepass-logo-1.svg";

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validateForm = (): boolean => {
    const username = formData.username.trim();
    const password = formData.password;
    const confirmPassword = formData.confirmPassword;

    if (username.length < 3 || username.length > 20) {
      setError(t("register.errors.usernameInvalid"));
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError(t("register.errors.usernameInvalid"));
      return false;
    }
    if (password.length < 8) {
      setError(t("register.errors.passwordTooShort"));
      return false;
    }
    if (password !== confirmPassword) {
      setError(t("register.errors.passwordMismatch"));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (!validateForm()) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(buildApiUrl("/api/users/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // 注册成功后跳转到登录页
        navigate("/login");
      } else {
        const errorMsg = result.error || t("register.errors.networkError");
        if (errorMsg.includes("already exists") || errorMsg.includes("已存在")) {
          setError(t("register.errors.usernameExists"));
        } else {
          setError(errorMsg);
        }
      }
    } catch (error) {
      console.error("注册失败:", error);
      setError(t("register.errors.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string) => (value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (error) setError("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-default-100 relative">
      {/* Theme Switch */}
      <div className="fixed bottom-4 right-4 z-50">
        <ThemeSwitch />
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="shadow-2xl">
            <CardHeader className="flex flex-col gap-1 items-center pb-6 pt-8 relative">
              {/* 语言切换 */}
              <div className="absolute top-4 right-4">
                <LanguageSwitch />
              </div>

              <motion.div
                animate={{ scale: 1 }}
                className="w-16 h-16 flex items-center justify-center mb-4"
                initial={{ scale: 0 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                <Image
                  priority
                  alt="NodePassDash Logo"
                  height={64}
                  src={logoSrc}
                  width={64}
                />
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground">
                {t("register.title")}
              </h1>
              <p className="text-small text-default-500">
                {t("register.subtitle")}
              </p>
            </CardHeader>

            <CardBody className="px-8 pb-8">
              {error && (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 bg-danger-50 border border-danger-200 rounded-lg mb-4"
                  initial={{ opacity: 0, x: -10 }}
                >
                  <p className="text-danger text-small">{error}</p>
                </motion.div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <Input
                  isRequired
                  label={t("register.username")}
                  placeholder={t("register.usernamePlaceholder")}
                  startContent={
                    <FontAwesomeIcon
                      className="text-default-400"
                      icon={faUser}
                    />
                  }
                  type="text"
                  value={formData.username}
                  variant="bordered"
                  onValueChange={handleInputChange("username")}
                />

                <Input
                  isRequired
                  endContent={
                    <button
                      className="focus:outline-none"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <FontAwesomeIcon
                        className="text-default-400 hover:text-default-600 transition-colors"
                        icon={showPassword ? faEyeSlash : faEye}
                      />
                    </button>
                  }
                  label={t("register.password")}
                  placeholder={t("register.passwordPlaceholder")}
                  startContent={
                    <FontAwesomeIcon
                      className="text-default-400"
                      icon={faLock}
                    />
                  }
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  variant="bordered"
                  onValueChange={handleInputChange("password")}
                />

                <Input
                  isRequired
                  endContent={
                    <button
                      className="focus:outline-none"
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      <FontAwesomeIcon
                        className="text-default-400 hover:text-default-600 transition-colors"
                        icon={showConfirmPassword ? faEyeSlash : faEye}
                      />
                    </button>
                  }
                  label={t("register.confirmPassword")}
                  placeholder={t("register.confirmPasswordPlaceholder")}
                  startContent={
                    <FontAwesomeIcon
                      className="text-default-400"
                      icon={faLock}
                    />
                  }
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  variant="bordered"
                  onValueChange={handleInputChange("confirmPassword")}
                />

                <Button
                  className="w-full font-semibold mt-2"
                  color="primary"
                  disabled={
                    !formData.username ||
                    !formData.password ||
                    !formData.confirmPassword ||
                    isLoading
                  }
                  isLoading={isLoading}
                  size="lg"
                  type="submit"
                >
                  {isLoading ? t("register.submitting") : t("register.submit")}
                </Button>
              </form>

              <Divider className="my-4" />

              <p className="text-center text-sm text-default-500">
                {t("register.haveAccount")}{" "}
                <Link to="/login" className="text-primary font-medium">
                  {t("register.switchToLogin")}
                </Link>
              </p>
            </CardBody>
          </Card>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
