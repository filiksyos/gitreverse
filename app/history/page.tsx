import { HistoryPage } from "@/components/history-page";

export const metadata = {
  title: "History — GitReverse",
  description: "Repositories you recently viewed on GitReverse.",
};

export default function HistoryRoute() {
  return <HistoryPage />;
}
