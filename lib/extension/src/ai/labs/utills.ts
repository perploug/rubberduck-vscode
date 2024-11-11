import { spawnSync } from "child_process";
import { env, workspace, window } from "vscode";

export const getDockerCredentials = async () => {
  const auth = spawnSync(
    `echo "https://index.docker.io/v1/" | docker-credential-desktop get`,
    {
      shell: process.platform === "win32" ? "powershell" : true,
    }
  );
  let Username = `vscode-${env.machineId}`;
  let Password = "";
  if (
    auth.stdout.toString().startsWith("{") &&
    auth.status === 0 &&
    !auth.error
  ) {
    try {
      const authPayload = JSON.parse(auth.stdout.toString()) as {
        ServerURL: string;
        Username: string;
        Secret: string;
      };
      Username = authPayload.Username;
      Password = authPayload.Secret;
    } catch (e) {
      throw new Error(
        `Expected JSON from docker-credential-desktop, got STDOUT: ${auth.stdout.toString()} STDERR: ${auth.stderr.toString()} ERR: ${(
          auth.error || "N/A"
        ).toString()}`
      );
    }
  }
  return {
    Username,
    Password,
  };
};

export const getWorkspaceFolder = async () => {
  const workspaceFolders = workspace.workspaceFolders;

  // TODO: fix stupid hack
  if (!workspaceFolders) {
    return "/Users/per/Documents/github/todo-app/";
  }

  let workspaceFolder = workspaceFolders[0];

  if (workspaceFolders.length > 1) {
    // Multi-root workspace support WIP
    const option = await window.showQuickPick(
      workspaceFolders.map((f) => ({
        label: f.name,
        detail: f.uri.fsPath,
        index: f.index,
      })),
      {
        title: "Select workspace",
        ignoreFocusOut: true,
      }
    );
    if (!option) {
      return "";
    }
    workspaceFolder = workspaceFolders[option.index];
  }

  return workspaceFolder?.uri.fsPath;
};

export type EmitterContext<T> = {
  emit: (value: T) => void;
  cancel: () => void;
};

export type EmitterCleanupFn = () => void | Promise<void>;

export type EmitterSubscriber<T> = (
  context: EmitterContext<T>
) => void | EmitterCleanupFn | Promise<EmitterCleanupFn | void>;

export async function* createEventIterator<T>(
  subscriber: EmitterSubscriber<T>
): AsyncGenerator<T> {
  const events: T[] = [];
  let cancelled = false;

  // Create a promise that resolves whenever a new event is added to the events array
  let resolveNext: (() => void) | null = null;

  const emit = (event: T) => {
    events.push(event);
    // If we are awaiting for a new event, resolve the promise
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  const cancel = () => {
    cancelled = true;

    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  const unsubscribe = await subscriber({ emit, cancel });

  try {
    while (!cancelled) {
      // If there are events in the queue, yield the next event
      if (events.length > 0) {
        yield events.shift()!;
      } else {
        // Wait for the next event
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }

    // Process any remaining events that were emitted before cancellation.
    while (events.length > 0) {
      yield events.shift()!;
    }
  } catch (ex) {
    console.log(ex);
  } finally {
    await unsubscribe?.();
  }
}
