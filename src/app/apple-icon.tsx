import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "#047857",
				borderRadius: 40,
			}}
		>
			<svg
				fill="none"
				height="110"
				viewBox="0 0 32 32"
				width="110"
				xmlns="http://www.w3.org/2000/svg"
			>
				<rect fill="#ecfdf5" height="14" rx="2.5" width="20" x="6" y="10" />
				<path
					d="M6 14.5h20"
					stroke="#047857"
					strokeLinecap="round"
					strokeWidth="2"
				/>
				<circle cx="22" cy="18.5" fill="#047857" r="2.5" />
			</svg>
		</div>,
		size,
	);
}
