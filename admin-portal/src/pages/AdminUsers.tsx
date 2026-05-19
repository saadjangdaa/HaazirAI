import { useEffect, useState } from 'react'
import { Badge } from '../components/Common/Badge'
import { useAuth } from '../hooks/useAuth'
import { createAdminUser, deleteAdminUser, fetchAdminUsers, updateAdminUser } from '../services/adminUsers'
import type { AdminUser } from '../types/admin'

export function AdminUsersPage() {
  const { session } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer', firebase_uid: '' })

  const load = () => fetchAdminUsers().then((r) => setUsers(r.users)).catch(console.error)
  useEffect(() => {
    load()
  }, [])

  if (session?.role !== 'super_admin') {
    return <p>Super admin access required.</p>
  }

  return (
    <>
      <h1 className="page-title">Admin Users</h1>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Add admin</h3>
        <div className="filters">
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Firebase UID (optional)" value={form.firebase_uid} onChange={(e) => setForm({ ...form, firebase_uid: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="super_admin">Super Admin</option>
            <option value="provider_manager">Provider Manager</option>
            <option value="dispute_manager">Dispute Manager</option>
            <option value="analytics_manager">Analytics Manager</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await createAdminUser(form)
              setForm({ email: '', name: '', role: 'viewer', firebase_uid: '' })
              load()
            }}
          >
            Add
          </button>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role.replace('_', ' ')}</td>
                <td>
                  <Badge status={u.active ? 'active' : 'inactive'} />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateAdminUser(u.id, { active: !u.active }).then(load)}
                  >
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteAdminUser(u.id).then(load)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
