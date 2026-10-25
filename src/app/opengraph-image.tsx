import { ImageResponse } from "next/og";

export const alt = "Sever — one profile, a CV for every job";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Paper/ink with the red-pencil rule (matches globals.css tokens). Kept to
// plain flexbox text: ImageResponse only lays out flex, and custom fonts
// would need binary files shipped for it.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f2f1ee",
          color: "#191817",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "12px", height: "12px", display: "flex", background: "#b3261e" }} />
          <div style={{ display: "flex", fontSize: "28px", letterSpacing: "6px" }}>SEVER</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "84px", lineHeight: "1.08" }}>
            One profile.
          </div>
          <div style={{ display: "flex", fontSize: "84px", lineHeight: "1.08" }}>
            A CV for every job.
          </div>
          <div style={{ display: "flex", marginTop: "28px", fontSize: "30px", color: "#5f5a53" }}>
            Paste a posting. Nothing invented; every edit reversible.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ height: "4px", width: "160px", display: "flex", background: "#b3261e" }} />
          <div style={{ display: "flex", fontSize: "24px", color: "#5f5a53" }}>
            Your data belongs to you: export or delete it any time.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
