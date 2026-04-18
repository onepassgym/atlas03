export default function Skeleton({ width = '100%', height = 16, count = 1, style = {} }) {
  return Array.from({ length: count }).map((_, i) => (
    <div
      key={i}
      style={{
        width, height, borderRadius: 'var(--radius-sm)',
        background: 'linear-gradient(90deg, var(--shimmer-from) 25%, var(--shimmer-via) 50%, var(--shimmer-from) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        marginBottom: i < count - 1 ? 8 : 0,
        ...style,
      }}
    />
  ));
}
