import { motion } from 'framer-motion';

/**
 * SealMark — the brand's heart. A circular signet stamp with an engraved "S",
 * concentric brass rings and a slowly rotating outer legend. Pure SVG so it's
 * razor-sharp and cheap to animate. This same mark will later morph (layoutId)
 * during the landing -> app transition.
 */
export function SealMark({ size = 320 }: { size?: number }) {
  const legend = 'VALUE·SEALED·SIGNET·OFFLINE·ONCHAIN·';

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <path id="legendPath" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" fill="none" />
        <clipPath id="sealClip">
          <circle cx="100" cy="100" r="53" />
        </clipPath>
      </defs>


      {/* rotating outer legend */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        style={{ originX: '100px', originY: '100px' }}
      >
        <text className="mono" fontSize="7.2" letterSpacing="3.1" fill="#C6A15B" opacity={0.75}>
          <textPath href="#legendPath">{legend + legend}</textPath>
        </text>
      </motion.g>

      {/* brass rings */}
      <circle cx="100" cy="100" r="66" fill="none" stroke="#C6A15B" strokeOpacity="0.35" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="#C6A15B" strokeOpacity="0.55" strokeWidth="0.6" />

      {/* signet logo with breathing pulse */}
      <motion.g
        animate={{ scale: [1, 1.015, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '100px', originY: '100px', filter: 'drop-shadow(0 8px 24px rgba(200,16,46,0.35))' }}
      >
        <image
          href="/signet.png"
          x="47" y="47" width="106" height="106"
          clipPath="url(#sealClip)"
          preserveAspectRatio="xMidYMid slice"
        />
      </motion.g>
      {/* rim highlight */}
      <circle cx="100" cy="100" r="52" fill="none" stroke="#F4F1EA" strokeOpacity="0.12" strokeWidth="1.4" />
    </motion.svg>

  );
}