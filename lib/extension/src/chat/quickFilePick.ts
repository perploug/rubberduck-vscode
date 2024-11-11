/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from "path";
import * as cp from "child_process";
import { Uri, window, Disposable } from "vscode";
import { QuickPickItem } from "vscode";
import { workspace } from "vscode";
import { getWorkspaceFolder } from "../ai/labs/utills";

/**
 * A file opener using window.createQuickPick().
 *
 * It shows how the list of items can be dynamically updated based on
 * the user's input in the filter field.
 */
export async function quickFileOpen(): Promise<FileItem | undefined> {
  return pickFile();
}

class FileItem implements QuickPickItem {
  label: string;
  description: string;
  relativePath: string;

  constructor(public base: Uri, public uri: Uri) {
    this.label = path.basename(uri.fsPath);
    this.description = path.dirname(path.relative(base.fsPath, uri.fsPath));
    this.relativePath = path.relative(base.fsPath, uri.fsPath);
  }
}

class MessageItem implements QuickPickItem {
  label: string;
  description = "";
  detail: string;

  constructor(public base: Uri, public message: string) {
    this.label = message.replace(/\r?\n/g, " ");
    this.detail = base.fsPath;
  }
}

async function pickFile() {
  const disposables: Disposable[] = [];
  const rootFolder = await getWorkspaceFolder();
  const workspaceRootFolder = workspace.workspaceFolders?.find(
    (x) => x.uri.fsPath === rootFolder
  );

  try {
    return await new Promise<FileItem | undefined>((resolve) => {
      const input = window.createQuickPick<FileItem | MessageItem>();
      input.placeholder = "Type to search for files";

      disposables.push(
        input.onDidChangeValue((value) => {
          if (!value) {
            input.items = [];
            return;
          }

          input.busy = true;

          workspace.findFiles("**").then((files) => {
            input.items = files.map(
              ///@ts-ignore
              (f) => new FileItem(workspaceRootFolder.uri, f)
            );
          });
        }),

        input.onDidChangeSelection((items) => {
          const item = items[0];
          if (item instanceof FileItem) {
            resolve(item);
            input.hide();
          }
        }),

        input.onDidHide(() => {
          resolve(undefined);
          input.dispose();
        })
      );
      input.show();
    });
  } finally {
    disposables.forEach((d) => d.dispose());
  }
}
