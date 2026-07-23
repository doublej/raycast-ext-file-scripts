import { Action, ActionPanel, Icon, List } from "@raycast/api";

export default function Command() {
  return (
    <List navigationTitle="Hello">
      <List.Item
        icon={Icon.Checkmark}
        title="It works"
        subtitle="Replace this command with your own"
        accessories={[{ text: "starter" }]}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard
              title="Copy Greeting"
              content="Hello from Raycast"
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
