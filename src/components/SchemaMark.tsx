/** Schema mark: two interlocking isometric blocks forming an S on a 30° grid. */
export const schemaMarkPaths = [
  "M638 207 1012 423 805 542.5 575 409.5 575 758 272 583 272 418Z",
  "M646 1091 272 875 479 755.5 709 888.5 709 540 1012 715 1012 880Z",
];
export function SchemaMark({ size = 24, title }: { size?: number; title?: string }) {
  return <svg className="sa-mark" width={size} height={size} viewBox="200 207 884 884" fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
    {schemaMarkPaths.map(d => <path key={d} d={d}/>)}
  </svg>;
}
