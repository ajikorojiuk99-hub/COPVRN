import React, { useState } from "react";

const DPSplash = ({ theme }: { theme: "light" | "dark" }) => (
  <div
    style={{
      position: "fixed",
      left: 0,
      top: 0,
      width: "100vw",
      height: "100vh",
      background: theme === "dark"
        ? "radial-gradient(ellipse at center, #232931 80%, #181b20 100%)"
        : "radial-gradient(ellipse at center, #e2ecf8 80%, #e0eaf7 100%)",
      color: theme === "dark" ? "#d5e6ff" : "#23457b",
      zIndex: 3000,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      transition: "opacity 0.6s"
    }}
  >
    <div style={{ marginBottom: 12 }}>
      {/* Анимированный SVG маячок ДПС */}
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill={theme === "dark" ? "#223A61" : "#2962FF"} opacity="0.11"/>
        <ellipse
          cx="32" cy="40" rx="18" ry="8"
          fill={theme === "dark" ? "#415073" : "#a7c7fa"}
          opacity="0.45"
        />
        <rect
          x="20" y="18" width="24" height="24" rx="12"
          fill={theme === "dark" ? "#5178FC" : "#3055C2"}
        />
        <rect
          x="26" y="22" width="12" height="16" rx="6"
          fill="#fff"
        >
          <animate attributeName="y" values="22;19;22" dur="1.6s" repeatCount="indefinite"/>
          <animate attributeName="height" values="16;22;16" dur="1.6s" repeatCount="indefinite"/>
        </rect>
        <ellipse
          cx="32" cy="20" rx="8" ry="4"
          fill="#88bbff"
          opacity="0.9"
        >
          <animate attributeName="ry" values="4;8;4" dur="1.2s" repeatCount="indefinite"/>
        </ellipse>
      </svg>
    </div>
    <div style={{ fontSize: 28, fontWeight: "bold", marginBottom: 8, letterSpacing: 1, textShadow: "0 2px 6px #0006" }}>
      Карта ДПС Воронеж
    </div>
    <div style={{ fontSize: 17, opacity: 0.74, marginBottom: 16 }}>
      {["Обновляем дорожную обстановку...",
        "Дороги под контролем 🚓",
        "Подгружаем свежие данные…"
      ][Math.floor(Math.random() * 3)]}
    </div>
    <div style={{
      fontSize: 12,
      color: theme === "dark" ? "#bbb" : "#839dc5",
      marginTop: 14,
      letterSpacing: "0.2em"
    }}>
      v1.0 • @dps_vrn_bot
    </div>
  </div>
);

export default function SplashDemo() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  return (
    <div>
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          style={{
            padding: "8px 18px",
            borderRadius: 7,
            background: theme === "dark" ? "#333" : "#fff",
            color: theme === "dark" ? "#fff" : "#333",
            border: "1px solid #bbb",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 20,
            boxShadow: "0 2px 8px 0 rgba(0,0,0,.07)"
          }}
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
      <DPSplash theme={theme} />
    </div>
  );
}