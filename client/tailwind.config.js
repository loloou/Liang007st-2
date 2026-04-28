/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f5ff",
          100: "#e0ebff",
          200: "#c7d9ff",
          300: "#a4bcff",
          400: "#7b96ff",
          500: "#5b7aff",
          600: "#3b5bff",
          700: "#2b4bdd",
          800: "#213bb0",
          900: "#1a2f8a"
        },
        glass: {
          white: "rgba(255, 255, 255, 0.7)",
          border: "rgba(255, 255, 255, 0.3)"
        }
      },
      boxShadow: {
        card: "0 8px 32px rgba(31, 38, 135, 0.12)",
        "card-hover": "0 12px 40px rgba(31, 38, 135, 0.18)",
        glow: "0 0 20px rgba(91, 122, 255, 0.3)"
      },
      borderRadius: {
        xl: "18px"
      },
      backdropBlur: {
        glass: "12px"
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        }
      }
    }
  },
  plugins: []
};
