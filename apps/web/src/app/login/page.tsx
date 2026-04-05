/**
 * Purpose: Login page stub for signing in to the ClawaaS control plane.
 * TODO: Wire the form to the FastAPI `/auth/login` endpoint and surface validation and session errors.
 */

export default function LoginPage() {
  return (
    <section>
      <h1>Login</h1>
      <form>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="user@example.com" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Password" />
        <button type="submit">Sign in</button>
      </form>
      <p>TODO: Connect this form to API auth and redirect to the dashboard on success.</p>
    </section>
  );
}
