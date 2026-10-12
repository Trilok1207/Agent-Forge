/** Standard reminder that simulated outcomes are not predictions. */
export function Disclaimer({ compact }: { compact?: boolean }) {
  return (
    <p className={`disclaimer${compact ? ' disclaimer--compact' : ''}`}>
      <strong>Simulated, not guaranteed.</strong> Results come from a simplified model of your inputs and assumptions. Use
      them to compare options and spot risks — not as predictions of real-world performance. This tool is for analysis and
      education only and must not be used to control equipment.
    </p>
  );
}
