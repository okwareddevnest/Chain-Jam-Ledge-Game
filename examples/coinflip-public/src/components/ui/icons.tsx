import type { SVGProps } from 'react';

/** Heads — dollar in gold ring. */
export function HeadsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M8 4.91667V4.23148M8 11.0833V11.7685M9.4838 5.94445C9.1876 5.53484 8.63407 5.25926 8 5.25926H7.80967C6.96873 5.25926 6.28704 5.80463 6.28704 6.47737V6.52966C6.28704 7.01087 6.62687 7.45073 7.16487 7.66593L8.83513 8.33407C9.37313 8.54927 9.71293 8.98913 9.71293 9.47033C9.71293 10.1719 9.002 10.7407 8.12493 10.7407H8C7.36593 10.7407 6.8124 10.4651 6.5162 10.0555M14.1667 8C14.1667 11.4057 11.4057 14.1667 8 14.1667C4.59425 14.1667 1.83333 11.4057 1.83333 8C1.83333 4.59425 4.59425 1.83333 8 1.83333C11.4057 1.83333 14.1667 4.59425 14.1667 8Z"
        stroke="#FFD700"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tails — silver ring with rotated square. */
export function TailsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M14.1667 8C14.1667 11.4057 11.4057 14.1667 8 14.1667C4.59425 14.1667 1.83333 11.4057 1.83333 8C1.83333 4.59425 4.59425 1.83333 8 1.83333C11.4057 1.83333 14.1667 4.59425 14.1667 8Z"
        stroke="#C4C4C4"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5.80464 7.52847L7.52847 5.80464C7.78887 5.54429 8.21093 5.54429 8.47133 5.80464L10.1951 7.52847C10.4555 7.78887 10.4555 8.21093 10.1951 8.47133L8.47133 10.1951C8.21093 10.4555 7.78887 10.4555 7.52847 10.1951L5.80464 8.47133C5.54429 8.21093 5.54429 7.78887 5.80464 7.52847Z"
        stroke="#C4C4C4"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Rocket — Fast Mode row icon. */
export function RocketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={32}
      height={32}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path d="M6.03704 23L2.33333 26.8095M9 26.0476L6.77777 28.3333" />
      <path d="M23 11.3333C23 12.622 21.9553 13.6667 20.6667 13.6667C19.378 13.6667 18.3333 12.622 18.3333 11.3333C18.3333 10.0447 19.378 9 20.6667 9C21.9553 9 23 10.0447 23 11.3333Z" />
      <path d="M11.6409 20.3591C9.34232 18.0605 4.33333 16.3731 4.33333 16.3731L7.52111 12.654C8.02772 12.063 8.76732 11.7228 9.54579 11.7228H12.3053C14.9625 6.4082 18.9485 3.08657 28.2491 3.75089C28.9135 13.0515 25.5917 17.0375 20.2772 19.6948V22.4543C20.2772 23.2327 19.9371 23.9723 19.346 24.4789L15.6269 27.6667C15.6269 27.6667 13.9396 22.6577 11.6409 20.3591Z" />
    </svg>
  );
}

/** Green LED strip shown above the active Manual/Auto tab. */
export function LedIndicator({ className }: { className?: string }) {
  const pillPath =
    'M 0.464 1.556 ' +
    'C 0.164 1.197 0 0.744 0 0.276 ' +
    'L 0 0 ' +
    'L 20 0 ' +
    'L 20 0.276 ' +
    'C 20 0.744 19.836 1.197 19.536 1.556 ' +
    'L 18.400 2.921 ' +
    'C 17.830 3.605 16.985 4 16.095 4 ' +
    'L 3.905 4 ' +
    'C 3.015 4 2.170 3.605 1.600 2.921 ' +
    'L 0.464 1.556 ' +
    'Z';
  return (
    <svg
      className={className}
      width="20"
      height="6"
      viewBox="0 0 20 6"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={pillPath} fill="#242424" transform="translate(0 1)" />
      <path d={pillPath} fill="#ffffff" fillOpacity="0.04" transform="translate(0 2)" />
      <path d={pillPath} fill="#59FF38" />
    </svg>
  );
}
