import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationsLoading() {
  return (
    <div className="flex h-full min-h-[60vh]">
      {/* Conversation list skeleton */}
      <div className="w-80 shrink-0 p-4 space-y-3" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-14 rounded-full" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Chat area skeleton */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Skeleton className="size-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-40 mx-auto" />
          <Skeleton className="h-3 w-56 mx-auto" />
        </div>
      </div>
    </div>
  );
}
