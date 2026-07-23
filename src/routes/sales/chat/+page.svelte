<script lang="ts">
  import ChatPage from "$lib/components/ai-chat/chat-page.svelte";
</script>

<svelte:head>
  <title>Sales Chat | Aggregator Offers Tool</title>
</svelte:head>

<ChatPage
  agentId="sales-agent"
  title="Sales Assistant"
  greeting="Ask me anything about the group's sales — revenue, transactions, items, brands, stores, channels, offers, and more. I can also export results to Excel."
  placeholder="Ask about sales, e.g. “revenue by brand this month”…"
/>
