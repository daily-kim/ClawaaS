/**
 * Purpose: Dashboard page stub showing a user's agents and a create-agent entrypoint.
 * TODO: Fetch the current user's agents and add optimistic creation for new agent records.
 */

const placeholderAgents = [
  { id: "agent-placeholder-1", name: "Example Agent", status: "created" },
];

export default function DashboardPage() {
  return (
    <section>
      <header>
        <h1>Dashboard</h1>
        <button type="button">New Agent</button>
      </header>
      <ul>
        {placeholderAgents.map((agent) => (
          <li key={agent.id}>
            <strong>{agent.name}</strong> <span>{agent.status}</span>
          </li>
        ))}
      </ul>
      <p>TODO: Replace placeholder data with API-backed agent lifecycle controls.</p>
    </section>
  );
}
