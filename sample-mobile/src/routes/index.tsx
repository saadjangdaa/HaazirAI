import { createFileRoute } from "@tanstack/react-router";
import { HaazirApp } from "@/components/haazir/HaazirApp";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <HaazirApp />;
}
