"use client";

interface FollowButtonProps {
  following: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export function FollowButton({ following, onClick, disabled, label }: FollowButtonProps) {
  return (
    <button
      type="button"
      className="follow-button"
      data-following={following}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={following}
      aria-label={label ? label : following ? "Unfollow" : "Follow"}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
