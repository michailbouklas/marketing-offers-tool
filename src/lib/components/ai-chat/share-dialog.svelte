<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { toast } from "svelte-sonner";

  interface Props {
    agentId: string;
    /** Key of the conversation to share. Mount the dialog to share it. */
    sessionKey: string;
    title: string;
    onClose: () => void;
  }

  let { agentId, sessionKey, title, onClose }: Props = $props();

  let link = $state("");
  let revoking = $state(false);

  function request(method: "POST" | "DELETE") {
    return fetch("/api/ai/chat/share", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, sessionKey }),
    });
  }

  // Runs once, when the dialog is mounted for a conversation. A failure
  // (including a missing ChatShare table) is a toast, never a broken chat.
  async function share() {
    try {
      const response = await request("POST");

      if (!response.ok) {
        throw new Error(`Share failed with status ${response.status}`);
      }

      const { id } = (await response.json()) as { id: string };
      link = `${location.origin}/chat/shared/${id}`;
    } catch {
      toast.error("Could not share the conversation. Please try again.");
      onClose();
    }
  }

  void share();

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  async function stopSharing() {
    revoking = true;

    try {
      const response = await request("DELETE");

      if (!response.ok) {
        throw new Error(`Revoke failed with status ${response.status}`);
      }

      toast.success("The link no longer works.");
      onClose();
    } catch {
      toast.error("Could not stop sharing. Please try again.");
    } finally {
      revoking = false;
    }
  }
</script>

<Dialog.Root
  open={link !== ""}
  onOpenChange={(open) => {
    if (!open && !revoking) {
      onClose();
    }
  }}
>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Share conversation</Dialog.Title>
      <Dialog.Description>
        Colleagues who may use this assistant and see the same brands can read "{title}"
        with this link, including answers added later. Attachments are not
        shared.
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex gap-2">
      <Input
        value={link}
        readonly
        aria-label="Share link"
        onfocus={(event) => event.currentTarget.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Copy link"
        onclick={copy}
      >
        <CopyIcon class="size-4" />
      </Button>
    </div>
    <Dialog.Footer>
      <Button
        type="button"
        variant="destructive"
        disabled={revoking}
        onclick={stopSharing}
      >
        Stop sharing
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
