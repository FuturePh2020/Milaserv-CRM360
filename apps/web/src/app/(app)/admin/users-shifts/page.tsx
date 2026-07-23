"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: "TEAM_LEADER" | "SHIFT_SUPERVISOR" | "AGENT";
  status: "ACTIVE" | "INACTIVE";
  teamId: string | null;
  activityTrackingEnabled: boolean;
}

interface TeamRow {
  id: string;
  name: string;
}

interface ShiftRow {
  id: string;
  name: string;
  teamId: string;
  startTimeLocal: string;
  endTimeLocal: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

export default function UsersAndShiftsPage() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => apiFetch<UserRow[]>("/users") });
  const teamsQuery = useQuery({ queryKey: ["teams"], queryFn: () => apiFetch<TeamRow[]>("/teams") });
  const shiftsQuery = useQuery({ queryKey: ["shifts"], queryFn: () => apiFetch<ShiftRow[]>("/shifts") });

  const [newUser, setNewUser] = useState({ email: "", fullName: "", password: "", role: "AGENT", teamId: "" });
  const createUser = useMutation({
    mutationFn: () =>
      apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ ...newUser, teamId: newUser.teamId || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setNewUser({ email: "", fullName: "", password: "", role: "AGENT", teamId: "" });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserRow> }) =>
      apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const [newTeamName, setNewTeamName] = useState("");
  const createTeam = useMutation({
    mutationFn: () => apiFetch("/teams", { method: "POST", body: JSON.stringify({ name: newTeamName }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setNewTeamName("");
    },
  });

  const [newShift, setNewShift] = useState({ name: "", teamId: "", startTimeLocal: "08:00", endTimeLocal: "16:00" });
  const createShift = useMutation({
    mutationFn: () => apiFetch("/shifts", { method: "POST", body: JSON.stringify(newShift) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setNewShift({ name: "", teamId: "", startTimeLocal: "08:00", endTimeLocal: "16:00" });
    },
  });

  const teamNameById = new Map((teamsQuery.data ?? []).map((t) => [t.id, t.name]));

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Users & Shifts</h1>

      <Section title="Users">
        <div className="mb-4 overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Activity Tracking</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data?.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="px-3 py-2">{user.fullName}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={user.role}
                      onChange={(e) => updateUser.mutate({ id: user.id, data: { role: e.target.value as UserRow["role"] } })}
                      className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <option value="AGENT">AGENT</option>
                      <option value="SHIFT_SUPERVISOR">SHIFT_SUPERVISOR</option>
                      <option value="TEAM_LEADER">TEAM_LEADER</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={user.status}
                      onChange={(e) => updateUser.mutate({ id: user.id, data: { status: e.target.value as UserRow["status"] } })}
                      className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={user.teamId ?? ""}
                      onChange={(e) => updateUser.mutate({ id: user.id, data: { teamId: e.target.value || undefined } })}
                      className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {teamsQuery.data?.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {user.role === "AGENT" ? (
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={user.activityTrackingEnabled}
                          onChange={(e) =>
                            updateUser.mutate({ id: user.id, data: { activityTrackingEnabled: e.target.checked } })
                          }
                        />
                        {user.activityTrackingEnabled ? "Enabled" : "Disabled"}
                      </label>
                    ) : (
                      <span className="text-xs text-muted-slate">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate();
          }}
          className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-white p-4 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Full name</label>
            <input
              required
              value={newUser.fullName}
              onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Email</label>
            <input
              required
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Password</label>
            <input
              required
              type="password"
              minLength={8}
              value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="AGENT">AGENT</option>
              <option value="SHIFT_SUPERVISOR">SHIFT_SUPERVISOR</option>
              <option value="TEAM_LEADER">TEAM_LEADER</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Team</label>
            <select
              value={newUser.teamId}
              onChange={(e) => setNewUser((p) => ({ ...p, teamId: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {teamsQuery.data?.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={createUser.isPending}
            className="rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
          >
            Add User
          </button>
        </form>
        {createUser.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {createUser.error instanceof Error ? createUser.error.message : "Could not create user."}
          </p>
        )}
      </Section>

      <Section title="Teams">
        <ul className="mb-3 flex flex-wrap gap-2">
          {teamsQuery.data?.map((team) => (
            <li key={team.id} className="rounded-full bg-app-bg px-3 py-1 text-sm text-app-text">
              {team.name}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTeam.mutate();
          }}
          className="flex items-end gap-2"
        >
          <input
            required
            placeholder="New team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            className="rounded-md border border-border px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={createTeam.isPending}
            className="rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
          >
            Add Team
          </button>
        </form>
      </Section>

      <Section title="Shifts">
        <div className="mb-3 overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody>
              {shiftsQuery.data?.map((shift) => (
                <tr key={shift.id} className="border-t border-border">
                  <td className="px-3 py-2">{shift.name}</td>
                  <td className="px-3 py-2">{teamNameById.get(shift.teamId) ?? "—"}</td>
                  <td className="px-3 py-2">
                    {shift.startTimeLocal} - {shift.endTimeLocal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createShift.mutate();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Name</label>
            <input
              required
              value={newShift.name}
              onChange={(e) => setNewShift((p) => ({ ...p, name: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Team</label>
            <select
              required
              value={newShift.teamId}
              onChange={(e) => setNewShift((p) => ({ ...p, teamId: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Select…
              </option>
              {teamsQuery.data?.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Start</label>
            <input
              type="time"
              value={newShift.startTimeLocal}
              onChange={(e) => setNewShift((p) => ({ ...p, startTimeLocal: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-slate">End</label>
            <input
              type="time"
              value={newShift.endTimeLocal}
              onChange={(e) => setNewShift((p) => ({ ...p, endTimeLocal: e.target.value }))}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={createShift.isPending}
            className="rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
          >
            Add Shift
          </button>
        </form>
        {createShift.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {createShift.error instanceof Error ? createShift.error.message : "Could not create shift."}
          </p>
        )}
      </Section>
    </div>
  );
}
