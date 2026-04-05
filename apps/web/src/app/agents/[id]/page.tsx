/**
 * Purpose: Per-agent chat page stub for sending bootstrap and chat turns.
 * TODO: Stream chat messages from the FastAPI backend and surface runtime READY state.
 */

type AgentChatPageProps = {
  params: {
    id: string;
  };
};

export default function AgentChatPage({ params }: AgentChatPageProps) {
  const { id } = params;

  return (
    <section>
      <h1>Agent {id}</h1>
      <div>
        <p>Conversation history will appear here.</p>
      </div>
      <form>
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" rows={5} placeholder="Send a bootstrap or chat turn." />
        <button type="submit">Send</button>
      </form>
      <p>TODO: Connect this screen to `/agents/{id}/bootstrap` and `/agents/{id}/chat`.</p>
    </section>
  );
}
