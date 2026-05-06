/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81"
        },
        surface: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          hover: "rgba(255, 255, 255, 0.1)",
          active: "rgba(255, 255, 255, 0.14)"
        },
        glass: {
          white: "rgba(255, 255, 255, 0.06)",
          border: "rgba(255, 255, 255, 0.08)"
        }
      },
      boxShadow: {
        card: "0 4px 24px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        "card-hover": "0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        glow: "0 0 20px rgba(99, 102, 241, 0.3)",
        "glow-sm": "0 0 10px rgba(99, 102, 241, 0.2)",
        "inner-glow": "inset 0 1px 0 rgba(255, 255, 255, 0.05)"
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px"
      },
      backdropBlur: {
        glass: "20px"
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "shimmer": "shimmer 2s ease-in-out infinite"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" }
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Courier New", "monospace"]
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }]
      }
    }
  },
  plugins: []
};
