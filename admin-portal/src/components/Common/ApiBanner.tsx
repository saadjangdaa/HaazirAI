/** Shown when admin API calls fail (wrong VITE_API_BASE_URL or backend down). */
export function ApiBanner({ message }: { message: string }) {
  return (
    <div
      className="card"
      style={{
        marginBottom: '1rem',
        borderColor: 'var(--danger, #ef4444)',
        background: 'rgba(239, 68, 68, 0.08)',
      }}
    >
      <strong>Backend connect nahi ho raha</strong>
      <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>{message}</p>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
        Agar message &quot;404&quot; ya &quot;Not Found&quot; ho: Render par <strong>purana backend</strong> chal
        raha hai — latest code deploy karein. Tab tak local test:{' '}
        <code>VITE_API_BASE_URL=http://localhost:8080</code> + backend port 8080 par chalayein.
      </p>
    </div>
  )
}
