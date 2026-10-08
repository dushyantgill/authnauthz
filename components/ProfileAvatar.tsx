"use client";
import { useState } from "react";
export function ProfileAvatar({
  user,
  large = false,
}: {
  user: Record<string, any>;
  large?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const photo =
    user.photos?.find((p: any) => p.type === "thumbnail")?.value ||
    user.photos?.[0]?.value ||
    user.photo;
  const initials = (user.displayName || user.userName || "?")
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("");
  return (
    <span className={"avatar profile-avatar" + (large ? " large" : "")}>
      {photo && failed !== photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(photo)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
