import { Router } from 'express';

export function createDashboardRouter(repos) {
  const router = Router();

  router.get('/stats', async (req, res, next) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [
        totalUsers,
        totalActivities,
        activitiesToday,
        activeActivities,
        totalAttendances,
        topActivities,
        allUsers,
      ] = await Promise.all([
        repos.users.count(),
        repos.activities.count(),
        repos.activities.countByDate(today),
        repos.activities.countByStatus('activa'),
        repos.attendance.count(),
        repos.activities.findTopByEnrolled(5),
        repos.users.findAll(),
      ]);

      const recentUsers = allUsers
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

      res.json({
        totalUsers,
        totalActivities,
        activitiesToday,
        activeActivities,
        totalAttendances,
        topActivities,
        recentUsers,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
