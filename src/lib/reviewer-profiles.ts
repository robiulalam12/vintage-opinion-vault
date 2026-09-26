import avatarRobiul from "@/assets/avatar-robiul.jpg";
import avatarJonas from "@/assets/avatar-jonas.jpg";
import avatarBenedikt from "@/assets/avatar-benedikt.jpg";
import avatarAfridi from "@/assets/avatar-afridi.jpg.asset.json";

type ReviewerProfileKey = "robiul" | "jonas" | "benedikt" | "afridi" | "jordan";

export type ReviewerProfile = {
  key: ReviewerProfileKey;
  name: string;
  path: string;
  avatar?: string;
  role: string;
  memberSince: string;
  photoDate: string;
};

export const REVIEWER_PROFILES: Record<ReviewerProfileKey, ReviewerProfile> = {
  robiul: {
    key: "robiul",
    name: "Robiul Alam",
    path: "/robiul-alam",
    avatar: avatarRobiul,
    role: "Business Owner",
    memberSince: "2009",
    photoDate: "2009-04-12",
  },
  jonas: {
    key: "jonas",
    name: "Jonas Weber",
    path: "/Jonas-Weber",
    avatar: avatarJonas,
    role: "Business Owner",
    memberSince: "2011",
    photoDate: "2011-06-08",
  },
  benedikt: {
    key: "benedikt",
    name: "Benedikt Herrmann",
    path: "/Benedikt-Herrmann",
    avatar: avatarBenedikt,
    role: "Business Owner",
    memberSince: "2008",
    photoDate: "2008-09-21",
  },
  afridi: {
    key: "afridi",
    name: "Afridi",
    path: "/afridi",
    avatar: avatarAfridi.url,
    role: "Business Owner",
    memberSince: "2014",
    photoDate: "2014-03-15",
  },
  jordan: {
    key: "jordan",
    name: "Jordan",
    path: "/Jordan/reviews",
    role: "Verified reviewer",
    memberSince: "2024",
    photoDate: "2024-01-01",
  },
};
