import srouterLogo from '@/assets/srouter-logo.svg'

/**
 * SRouter brand mark — final geometry (broken gradient ring, dual dots, S stroke).
 * Source of truth: client/src/assets/srouter-logo.svg (IoU 97.85% vs raster master).
 */
export function LogoMark({ className = 'size-5' }: { className?: string }) {
  return <img src={srouterLogo} alt="SRouter" className={className} />
}
