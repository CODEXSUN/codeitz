import { CompactMessage } from "@workspace/ui/components/compact-message";

type Props = { text: string; markdown?: boolean; streaming?: boolean };
export function CompactText({ text, markdown = false, streaming = false }: Props) {
  return <CompactMessage content={text} markdown={markdown} streaming={streaming} />;
}
