import { useId } from 'react';

/** Tight crop of the 4 color bars for linesOnly (path bounds + bottom shadow). */
const LINES_ONLY_VIEWBOX = '20 12 32 23';

const ChainSmallLogo = ({
  className,
  linesOnly = false,
}: {
  className?: string;
  linesOnly?: boolean;
}) => {
  const uid = useId().replace(/:/g, '');
  const svgId = (name: string) => `${uid}-${name}`;

  return (
    <svg
      width={linesOnly ? undefined : 53}
      height={linesOnly ? undefined : 22}
      viewBox={linesOnly ? LINES_ONLY_VIEWBOX : '18 12 53 22'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={[linesOnly ? 'w-auto' : '', className ?? ''].join(' ').trim() || undefined}
    >
      <g filter={`url(#${svgId('filter1')})`}>
        <path
          d="M41.3428 29.3706H22.2571C22.1523 29.3706 22.0536 29.427 22.0012 29.5197L20.0386 32.9895C19.9278 33.1849 20.0688 33.4267 20.2925 33.4267H39.4548C39.5615 33.4267 39.6603 33.3683 39.7127 33.2736L41.5987 29.8038C41.7055 29.6084 41.5644 29.3706 41.3408 29.3706H41.3428Z"
          fill="#334BA0"
        />
      </g>
      <g filter={`url(#${svgId('filter2')})`}>
        <path
          d="M44.6017 23.5508H25.4334C25.3266 23.5508 25.2278 23.6092 25.1775 23.7019L23.2089 27.2603C23.1001 27.4558 23.2431 27.6956 23.4648 27.6956H42.6331C42.7399 27.6956 42.8386 27.6371 42.889 27.5444L44.8576 23.986C44.9664 23.7906 44.8253 23.5508 44.6017 23.5508Z"
          fill="#9EDAE5"
        />
      </g>
      <g filter={`url(#${svgId('filter3')})`}>
        <path
          d="M47.7772 17.8188H28.6049C28.4981 17.8188 28.3993 17.8773 28.3469 17.972L26.4609 21.4438C26.3541 21.6392 26.4952 21.877 26.7188 21.877H45.8912C45.998 21.877 46.0967 21.8185 46.1491 21.7238L48.0351 18.2521C48.1419 18.0566 48.0008 17.8188 47.7772 17.8188Z"
          fill="#F4ED66"
        />
      </g>
      <g filter={`url(#${svgId('filter4')})`}>
        <path
          d="M51.0399 12.0005H31.8716C31.7648 12.0005 31.6661 12.0589 31.6157 12.1516L29.6471 15.71C29.5383 15.9055 29.6793 16.1453 29.903 16.1453H49.0713C49.1781 16.1453 49.2768 16.0868 49.3272 15.9941L51.2958 12.4357C51.4046 12.2403 51.2636 12.0005 51.0399 12.0005Z"
          fill="#D53427"
        />
      </g>
      {!linesOnly && (
        <g filter={`url(#${svgId('filter5')})`}>
          <path
            d="M63.6611 28.5408H52.6231C52.3511 28.5408 52.1799 28.2507 52.3108 28.0129L57.5175 18.5768C57.5799 18.462 57.5759 18.3229 57.5054 18.2141L56.8465 17.1744C56.7719 17.0555 56.8566 16.9024 56.9956 16.9004L62.9075 16.8661C63.1795 16.8661 63.3528 17.1563 63.2218 17.394L61.4648 20.5737C61.3338 20.8114 61.5051 21.1016 61.7771 21.1016H68.1726C68.3036 21.1016 68.4224 21.031 68.4849 20.9162L70.9149 16.4672C70.9754 16.3564 70.9734 16.2234 70.9089 16.1146L68.5776 12.1753C68.5131 12.0665 68.3962 12 68.2713 12H54.2452C54.1162 12 53.9973 12.0705 53.9349 12.1834L42.4315 32.8226C42.2985 33.0604 42.4718 33.3525 42.7418 33.3525H61.354C61.4829 33.3525 61.6018 33.284 61.6643 33.1712L63.9754 29.0707C64.1084 28.833 63.9371 28.5388 63.6651 28.5388L63.6611 28.5408Z"
            fill={`url(#${svgId('paint5')})`}
          />
        </g>
      )}
      <defs>
        <filter
          id={svgId('filter1')}
          x="15"
          y="27.3706"
          width="31.635"
          height="14.0562"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="2.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.03 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_935_5888" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_935_5888"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="0.5" dy="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0" />
          <feBlend mode="normal" in2="shape" result="effect2_innerShadow_935_5888" />
        </filter>
        <filter
          id={svgId('filter2')}
          x="18.1716"
          y="21.5508"
          width="31.7234"
          height="14.145"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="2.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.03 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_935_5888" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_935_5888"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="0.5" dy="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0" />
          <feBlend mode="normal" in2="shape" result="effect2_innerShadow_935_5888" />
        </filter>
        <filter
          id={svgId('filter3')}
          x="21.4246"
          y="15.8188"
          width="31.647"
          height="14.0581"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="2.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.03 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_935_5888" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_935_5888"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="0.5" dy="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0" />
          <feBlend mode="normal" in2="shape" result="effect2_innerShadow_935_5888" />
        </filter>
        <filter
          id={svgId('filter4')}
          x="24.6096"
          y="10.0005"
          width="31.7236"
          height="14.1445"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="2.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.03 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_935_5888" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_935_5888"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="0.5" dy="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0" />
          <feBlend mode="normal" in2="shape" result="effect2_innerShadow_935_5888" />
        </filter>
        <filter
          id={svgId('filter5')}
          x="37.3857"
          y="10"
          width="197.981"
          height="31.4971"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="2.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.03 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_935_5888" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="0.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.2 0" />
          <feBlend
            mode="normal"
            in2="effect1_dropShadow_935_5888"
            result="effect2_dropShadow_935_5888"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect2_dropShadow_935_5888"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="0.5" dy="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
          <feBlend mode="normal" in2="shape" result="effect3_innerShadow_935_5888" />
        </filter>
        <linearGradient
          id={svgId('paint5')}
          x1="44.2748"
          y1="12"
          x2="215.641"
          y2="70.867"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#E7E7E7" />
          <stop offset="1" stop-color="#959595" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default ChainSmallLogo;
