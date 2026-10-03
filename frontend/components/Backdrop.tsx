/** Fixed page ground: the fading grid and the two ambient glows. */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop-grid" />
      <div className="backdrop-glow-a" />
      <div className="backdrop-glow-b" />
    </div>
  )
}
