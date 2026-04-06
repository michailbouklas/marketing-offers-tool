<script lang="ts">
  import { signOut } from "$lib/auth-client.js";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";

  type Props = {
    class?: string;
  };

  let { class: className = "" }: Props = $props();

  let isLoading = $state(false);

  async function handleSignOut() {
    isLoading = true;
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          goto("/login");
        },
      },
    });
    isLoading = false;
  }
</script>

<Button
  variant="outline"
  onclick={handleSignOut}
  disabled={isLoading}
  class={className}
>
  {#if isLoading}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="mr-2 size-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    Signing out…
  {:else}
    Sign Out
  {/if}
</Button>
