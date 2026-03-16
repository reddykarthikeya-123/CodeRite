/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Brand colors from RITE logo
                brand: {
                    blue: {
                        deep: '#1E3A8A',    // Logo dark navy
                        royal: '#1E40AF',   // Primary brand blue
                        bright: '#3B82F6',  // Interactive blue
                    },
                    cyan: {
                        electric: '#06B6D4', // Logo cyan highlight
                        base: '#0891B2',     // Secondary cyan
                        deep: '#0E7490',
                    },
                },
                // Interactive states
                interactive: {
                    default: '#3B82F6',
                    hover: '#2563EB',
                    active: '#1D4ED8',
                    disabled: '#94A3B8',
                },
            },
            backgroundImage: {
                'brand-gradient': 'linear-gradient(135deg, #1E3A8A 0%, #06B6D4 100%)',
                'brand-gradient-soft': 'linear-gradient(135deg, rgba(30,58,138,0.1) 0%, rgba(6,182,212,0.1) 100%)',
            },
            keyframes: {
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(300%)' }
                },
                pulse: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '.8' },
                },
            },
            animation: {
                shimmer: 'shimmer 2s infinite',
                pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            boxShadow: {
                'brand-sm': '0 1px 2px 0 rgba(30, 58, 138, 0.05)',
                'brand': '0 4px 6px -1px rgba(30, 58, 138, 0.1), 0 2px 4px -1px rgba(30, 58, 138, 0.06)',
                'brand-lg': '0 10px 15px -3px rgba(30, 58, 138, 0.1), 0 4px 6px -2px rgba(30, 58, 138, 0.05)',
                'brand-xl': '0 20px 25px -5px rgba(30, 58, 138, 0.1), 0 10px 10px -5px rgba(30, 58, 138, 0.04)',
            },
        },
    },
    plugins: [],
}
