/** Plain form POST: the browser sends Origin, which the API checks (CSRF). */
export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form method="post" action="/api/auth/sign-out">
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
