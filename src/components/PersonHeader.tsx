"use client";

import { FollowButton } from "./FollowButton";

interface PersonHeaderProps {
  displayName: string;
  eventCount: number;
  following: boolean;
  onToggleFollow: () => void;
}

export function PersonHeader({
  displayName,
  eventCount,
  following,
  onToggleFollow,
}: PersonHeaderProps) {
  return (
    <div className="person-header">
      <div className="person-info">
        <div className="person-avatar" aria-hidden="true">
          {displayName}
        </div>
        <div>
          <h2 className="person-name">{displayName}</h2>
          <p className="person-count">
            {eventCount} upcoming public appearance{eventCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <FollowButton
        following={following}
        onClick={onToggleFollow}
        label={`${following ? "Unfollow" : "Follow"} ${displayName}`}
      />
    </div>
  );
}
