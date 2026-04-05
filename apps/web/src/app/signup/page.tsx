/**
 * Purpose: Signup page stub for creating a new ClawaaS account.
 * TODO: Wire the form to the FastAPI `/auth/signup` endpoint and handle duplicate-user errors.
 */

export default function SignupPage() {
  return (
    <section>
      <h1>Sign Up</h1>
      <form>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="user@example.com" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Create a password" />
        <button type="submit">Create account</button>
      </form>
      <p>TODO: Create the user, establish a session, and send the user to the dashboard.</p>
    </section>
  );
}
