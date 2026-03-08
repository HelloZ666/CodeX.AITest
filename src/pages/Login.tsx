import React, { useState } from 'react';
import { EyeInvisibleOutlined, EyeOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AnimatedCharacters from '../components/Auth/AnimatedCharacters';
import AutofillGuard from '../components/Auth/AutofillGuard';
import './Login.css';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const redirectPath = (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname || '/';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setErrorMessage('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      await login(normalizedUsername, password);
      navigate(redirectPath, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="preview-login">
      <section className="preview-login__showcase">
        <div className="preview-login__pattern" />
        <div className="preview-login__orb preview-login__orb--one" />
        <div className="preview-login__orb preview-login__orb--two" />

        <div className="preview-login__brand">
          <span className="preview-login__brand-logo-shell">
            <img src="/cpic-mark.png" alt="智测平台" className="preview-login__brand-logo" />
          </span>
          <span className="preview-login__brand-name">智测平台</span>
        </div>

        <div className="preview-login__animation">
          <AnimatedCharacters
            isTyping={isTyping}
            showPassword={showPassword}
            passwordLength={password.length}
          />
        </div>

        <div className="preview-login__legal">
          <span>内部系统</span>
          <span>仅授权访问</span>
        </div>
      </section>

      <section className="preview-login__panel">
        <div className="preview-login__panel-inner">
          <div className="preview-login__mobile-brand">
            <span className="preview-login__brand-logo-shell">
              <img src="/cpic-mark.png" alt="智测平台" className="preview-login__brand-logo" />
            </span>
            <span className="preview-login__brand-name preview-login__brand-name--dark">智测平台</span>
          </div>

          <div className="preview-login__header">
            <h1 className="preview-login__title">欢迎回来</h1>
            <p className="preview-login__subtitle">请输入账号信息，继续进入系统</p>
          </div>

          <form className="preview-login__form" onSubmit={handleSubmit} autoComplete="off">
            <AutofillGuard idPrefix="login" />

            <div className="preview-login__field-group">
              <label htmlFor="login-account" className="preview-login__label">
                用户名
              </label>
              <div className="preview-login__field">
                <UserOutlined className="preview-login__field-icon" />
                <input
                  id="login-account"
                  name="login_account"
                  type="text"
                  placeholder="请输入用户名"
                  autoComplete="off"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  className="preview-login__input"
                />
              </div>
            </div>

            <div className="preview-login__field-group">
              <label htmlFor="login-secret" className="preview-login__label">
                密码
              </label>
              <div className="preview-login__field">
                <LockOutlined className="preview-login__field-icon" />
                <input
                  id="login-secret"
                  name="login_secret"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="preview-login__input preview-login__input--password"
                />
                <button
                  type="button"
                  className="preview-login__toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                </button>
              </div>
            </div>

            <div className="preview-login__meta">
              <span>会话有效期 7 天</span>
              <span>账号由管理员创建</span>
            </div>

            {errorMessage ? (
              <div role="alert" className="preview-login__error">
                {errorMessage}
              </div>
            ) : null}

            <button type="submit" className="preview-login__submit" disabled={submitting}>
              <span>{submitting ? '登录中...' : '登录'}</span>
              <span className="preview-login__submit-arrow">→</span>
            </button>
          </form>

          <div className="preview-login__footer">
            没有开放自助注册、忘记密码与邀请注册，如需帮助请联系管理员。
          </div>
        </div>
      </section>
    </div>
  );
};

export default LoginPage;
