import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CodeBlock from "./code-block";

interface CodeExample {
  label: string;
  language: string;
  code: string;
}

interface CodeTabsProps {
  examples: CodeExample[];
}

export default function CodeTabs({ examples }: CodeTabsProps) {
  if (examples.length === 0) return null;

  return (
    <Tabs defaultValue={0}>
      <TabsList>
        {examples.map((ex, i) => (
          <TabsTrigger key={i} value={i}>
            {ex.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {examples.map((ex, i) => (
        <TabsContent key={i} value={i}>
          <CodeBlock code={ex.code} language={ex.language} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
