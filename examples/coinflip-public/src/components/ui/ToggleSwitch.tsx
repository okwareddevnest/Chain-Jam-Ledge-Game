import type { ButtonHTMLAttributes } from 'react';

export type ToggleSwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'aria-checked'
> & {
  checked: boolean;
  onChange: (next: boolean) => void;
  'aria-label': string;
};

/**
 * Physical ON/OFF switch (Fast Mode row). Both states render the Figma-exported
 * SVGs verbatim; the OFF version flips the gradient so the knob seam lands on
 * the left, the ON version keeps it on the right.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  type = 'button',
  ...rest
}: ToggleSwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="ck-switch"
      {...rest}
    >
      {checked ? <ToggleOnSvg /> : <ToggleOffSvg />}
    </button>
  );
}

function ToggleOffSvg() {
  return (
    <svg
      className="ck-switch__svg"
      width="78"
      height="56"
      viewBox="0 0 78 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g filter="url(#ck-off-filter0)">
        <rect
          width="73"
          height="39"
          rx="8"
          transform="matrix(-1 -4.37114e-08 -4.37114e-08 1 75.3 0)"
          fill="url(#ck-off-paint0)"
          shapeRendering="crispEdges"
        />
        <g filter="url(#ck-off-filter1)">
          <g clipPath="url(#ck-off-clip0)">
            <rect
              width="69"
              height="35"
              rx="6"
              transform="matrix(-1 -4.37114e-08 -4.37114e-08 1 73.3 2)"
              fill="url(#ck-off-paint1)"
            />
            <path
              d="M25.0114 3.91242L73.3 2L4.3 2L20.5997 3.76213C22.0646 3.92049 23.5391 3.97073 25.0114 3.91242Z"
              fill="#434343"
            />
            <path
              d="M25.0114 35.0876L73.3 37L4.3 37L20.5997 35.2379C22.0646 35.0795 23.5391 35.0293 25.0114 35.0876Z"
              fill="#0E0E0E"
            />
            <path
              d="M36.8 26.1666C34.0328 26.1666 31.7896 23.4057 31.7896 20C31.7896 16.5942 34.0328 13.8333 36.8 13.8333C39.5672 13.8333 41.8104 16.5942 41.8104 20C41.8104 23.4057 39.5672 26.1666 36.8 26.1666Z"
              stroke="white"
              strokeOpacity="0.3"
              strokeWidth="1.5"
            />
          </g>
        </g>
      </g>
      <defs>
        <filter
          id="ck-off-filter0"
          x="2.3"
          y="0"
          width="73"
          height="40"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <filter
          id="ck-off-filter1"
          x="0"
          y="2"
          width="77.6"
          height="58.3"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feMorphology radius="2" operator="erode" in="SourceAlpha" result="effect1_dropShadow" />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="2.85" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.77 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <linearGradient
          id="ck-off-paint0"
          x1="36.5"
          y1="0"
          x2="36.5"
          y2="39"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopOpacity="0.37" />
          <stop offset="1" />
        </linearGradient>
        <linearGradient
          id="ck-off-paint1"
          x1="69"
          y1="17.5"
          x2="0"
          y2="17.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#292929" />
          <stop offset="0.2573" stopColor="#070707" />
          <stop offset="0.271442" stopColor="#292929" />
          <stop offset="1" stopColor="#101010" />
        </linearGradient>
        <clipPath id="ck-off-clip0">
          <rect
            width="69"
            height="35"
            rx="6"
            transform="matrix(-1 -4.37114e-08 -4.37114e-08 1 73.3 2)"
            fill="white"
          />
        </clipPath>
      </defs>
    </svg>
  );
}

function ToggleOnSvg() {
  return (
    <svg
      className="ck-switch__svg"
      width="78"
      height="56"
      viewBox="0 0 78 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g filter="url(#ck-on-filter0)">
        <rect
          x="2.29999"
          width="73"
          height="39"
          rx="8"
          fill="url(#ck-on-paint0)"
          shapeRendering="crispEdges"
        />
        <g filter="url(#ck-on-filter1)">
          <g clipPath="url(#ck-on-clip0)">
            <rect x="4.29999" y="2" width="69" height="35" rx="6" fill="url(#ck-on-paint1)" />
            <path
              d="M52.5886 3.91242L4.29999 2L73.3 2L57.0003 3.76213C55.5354 3.9205 54.0609 3.97073 52.5886 3.91242Z"
              fill="#434343"
            />
            <path
              d="M52.5886 35.0876L4.29999 37L73.3 37L57.0003 35.2379C55.5354 35.0795 54.0609 35.0293 52.5886 35.0876Z"
              fill="#0E0E0E"
            />
            <g clipPath="url(#ck-on-clip1)">
              <path
                d="M41.1076 26.5121L41.1076 13.8726"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        </g>
      </g>
      <defs>
        <filter
          id="ck-on-filter0"
          x="2.29999"
          y="0"
          width="73"
          height="40"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <filter
          id="ck-on-filter1"
          x="0"
          y="2"
          width="77.6"
          height="58.3"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feMorphology radius="2" operator="erode" in="SourceAlpha" result="effect1_dropShadow" />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="2.85" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.77 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <linearGradient
          id="ck-on-paint0"
          x1="38.8"
          y1="0"
          x2="38.8"
          y2="39"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopOpacity="0.37" />
          <stop offset="1" />
        </linearGradient>
        <linearGradient
          id="ck-on-paint1"
          x1="73.3"
          y1="19.5"
          x2="4.29999"
          y2="19.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#292929" />
          <stop offset="0.2573" stopColor="#070707" />
          <stop offset="0.271442" stopColor="#292929" />
          <stop offset="1" stopColor="#101010" />
        </linearGradient>
        <clipPath id="ck-on-clip0">
          <rect x="4.29999" y="2" width="69" height="35" rx="6" fill="white" />
        </clipPath>
        <clipPath id="ck-on-clip1">
          <rect width="13" height="16" fill="white" transform="translate(34.3 12)" />
        </clipPath>
      </defs>
    </svg>
  );
}
