import React from "react";

export default function SplashScreen({ onEnd }: { onEnd?: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        background: "#111",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      <video
        src="/1we.mp4"
        autoPlay
        muted
        playsInline
        style={{
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
        }}
        onEnded={onEnd}
      />
      {/* Можно добавить логотип/текст/анимацию поверх с absolute-позиционированием */}
    </div>
  );
}