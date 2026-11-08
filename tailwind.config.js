const tons = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// Cores ligadas às variáveis de app/globals.css (tema claro/escuro automático, pelo ajuste do celular).
const paleta = (nome) => Object.fromEntries(tons.map((t) => [t, `rgb(var(--${nome}-${t}) / <alpha-value>)`]));

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zon: '#2563eb',
        ettore: '#16a34a',
        slate: paleta('slate'),
        red: paleta('red'),
        emerald: paleta('emerald'),
        amber: paleta('amber'),
        blue: paleta('blue'),
      },
    },
  },
  plugins: [],
};
