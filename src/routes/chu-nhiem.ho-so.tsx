import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { ProfilesPage } from "@/components/homeroom/ProfilesPage";

export const Route = createFileRoute("/chu-nhiem/ho-so")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Hồ sơ học sinh · Lớp Học Số" },
      {
        name: "description",
        content: "Hồ sơ học sinh lớp chủ nhiệm, người giám hộ, nhập và xuất Excel.",
      },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-profiles" title="Hồ sơ học sinh">
      {(ctx) => <ProfilesPage {...ctx} />}
    </HomeroomFrame>
  ),
});
