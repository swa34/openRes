export function EndpointIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={24}
      height={24}
      {...props}
    >
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h6" />
      <rect x={17} y={10} width={5} height={5} rx={1} fill="currentColor" stroke="none" />
    </svg>
  );
}
