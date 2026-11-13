<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { SubmitFunction } from "@sveltejs/kit";

  type Props = {
    user: { id: string; name: string; banned: boolean };
    size?: "sm" | "default";
  };

  let { user, size = "sm" }: Props = $props();
  let confirmOpen = $state(false);
  let submitting = $state(false);

  // Posts to `?/deactivateUser` / `?/reactivateUser` on the current page; both
  // /admin/users and /admin/users/[id] spread `userAdminActions`.
  const submit: SubmitFunction = () => {
    submitting = true;
    return async ({ result, update }) => {
      submitting = false;
      if (result.type === "success") {
        confirmOpen = false;
        toast.success(
          user.banned
            ? `${user.name} reactivated.`
            : `${user.name} deactivated.`,
        );
        await update();
      } else if (result.type === "failure") {
        toast.error(String(result.data?.error ?? "Unable to update the user."));
      } else {
        await update();
      }
    };
  };
</script>

{#if user.banned}
  <form method="POST" action="?/reactivateUser" use:enhance={submit}>
    <input type="hidden" name="userId" value={user.id} />
    <Button type="submit" variant="outline" {size} disabled={submitting}>
      Reactivate
    </Button>
  </form>
{:else}
  <Button variant="destructive" {size} onclick={() => (confirmOpen = true)}>
    Deactivate
  </Button>

  <AlertDialog.Root
    open={confirmOpen}
    onOpenChange={(open) => {
      if (!submitting) {
        confirmOpen = open;
      }
    }}
  >
    <AlertDialog.Content>
      <form method="POST" action="?/deactivateUser" use:enhance={submit}>
        <input type="hidden" name="userId" value={user.id} />
        <AlertDialog.Header>
          <AlertDialog.Title>Deactivate {user.name}?</AlertDialog.Title>
          <AlertDialog.Description>
            They are signed out everywhere and can no longer sign in. Their data
            and history are kept, and you can reactivate them at any time.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer class="mt-4">
          <AlertDialog.Cancel type="button" disabled={submitting}>
            Cancel
          </AlertDialog.Cancel>
          <Button type="submit" variant="destructive" disabled={submitting}>
            Deactivate
          </Button>
        </AlertDialog.Footer>
      </form>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
