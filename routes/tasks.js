var mongoose = require('mongoose');
var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {

    var tasksRoute = router.route('/tasks');
    var tasksIdRoute = router.route('/tasks/:id');

    tasksRoute.get(async function (req, res) {
        var where = {};
        var sort = {};
        var select = {};
        try {
            if (req.query.where) where = JSON.parse(req.query.where);
            if (req.query.sort) sort = JSON.parse(req.query.sort);
            if (req.query.select) select = JSON.parse(req.query.select);
        } catch (err) {
            return res.status(400).json({ message: 'The query parameters are not valid JSON', data: [] });
        }

        try {
            if (req.query.count === 'true') {
                var total = await Task.countDocuments(where);
                return res.status(200).json({ message: 'OK', data: total });
            }

            var query = Task.find(where).sort(sort).select(select);
            if (req.query.skip) query.skip(Number(req.query.skip));
            query.limit(req.query.limit ? Number(req.query.limit) : 100);

            var tasks = await query.exec();
            res.status(200).json({ message: 'OK', data: tasks });
        } catch (err) {
            res.status(500).json({ message: 'Could not get the tasks', data: [] });
        }
    });

    tasksRoute.post(async function (req, res) {
        try {
            var name = req.body.name;
            if (typeof name !== 'string' || name === '') {
                return res.status(400).json({ message: 'A task needs a name', data: [] });
            }

            var deadline = req.body.deadline;
            if (typeof deadline !== 'string' && typeof deadline !== 'number') {
                return res.status(400).json({ message: 'A task needs a deadline', data: [] });
            }
            var when = new Date(deadline);
            if (isNaN(when.getTime())) {
                return res.status(400).json({ message: 'The deadline is not a real date', data: [] });
            }

            var description = req.body.description === undefined ? '' : req.body.description;
            var completed = req.body.completed === undefined ? false : req.body.completed;
            var assignedUser = req.body.assignedUser === undefined ? '' : req.body.assignedUser;
            if (typeof description !== 'string' || typeof completed !== 'boolean' || typeof assignedUser !== 'string') {
                return res.status(400).json({ message: 'One of the task fields has the wrong type', data: [] });
            }

            var assignedUserName = 'unassigned';
            if (assignedUser !== '') {
                if (!mongoose.Types.ObjectId.isValid(assignedUser)) {
                    return res.status(400).json({ message: 'assignedUser is not a valid user id', data: [] });
                }
                var owner = await User.findById(assignedUser);
                if (!owner) {
                    return res.status(404).json({ message: 'The assigned user does not exist', data: [] });
                }
                if (req.body.assignedUserName !== undefined && req.body.assignedUserName !== owner.name) {
                    return res.status(400).json({ message: 'assignedUserName does not match the assigned user', data: [] });
                }
                assignedUserName = owner.name;
            }

            var task = await Task.create({
                name: name,
                description: description,
                deadline: when,
                completed: completed,
                assignedUser: assignedUser,
                assignedUserName: assignedUserName
            });

            if (assignedUser !== '' && !completed) {
                await User.updateOne({ _id: assignedUser }, { $addToSet: { pendingTasks: task._id.toString() } });
            }

            res.status(201).json({ message: 'Task created', data: task });
        } catch (err) {
            res.status(500).json({ message: 'Could not create the task', data: [] });
        }
    });

    tasksIdRoute.get(async function (req, res) {
        var select = {};
        try {
            if (req.query.select) select = JSON.parse(req.query.select);
        } catch (err) {
            return res.status(400).json({ message: 'The select parameter is not valid JSON', data: [] });
        }

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }
            var task = await Task.findById(req.params.id).select(select).exec();
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }
            res.status(200).json({ message: 'OK', data: task });
        } catch (err) {
            res.status(500).json({ message: 'Could not get the task', data: [] });
        }
    });

    tasksIdRoute.put(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }
            var task = await Task.findById(req.params.id);
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }

            var name = req.body.name;
            if (typeof name !== 'string' || name === '') {
                return res.status(400).json({ message: 'A task needs a name', data: [] });
            }

            var deadline = req.body.deadline;
            if (typeof deadline !== 'string' && typeof deadline !== 'number') {
                return res.status(400).json({ message: 'A task needs a deadline', data: [] });
            }
            var when = new Date(deadline);
            if (isNaN(when.getTime())) {
                return res.status(400).json({ message: 'The deadline is not a real date', data: [] });
            }

            var description = req.body.description === undefined ? '' : req.body.description;
            var completed = req.body.completed === undefined ? false : req.body.completed;
            var assignedUser = req.body.assignedUser === undefined ? '' : req.body.assignedUser;
            if (typeof description !== 'string' || typeof completed !== 'boolean' || typeof assignedUser !== 'string') {
                return res.status(400).json({ message: 'One of the task fields has the wrong type', data: [] });
            }

            var assignedUserName = 'unassigned';
            if (assignedUser !== '') {
                if (!mongoose.Types.ObjectId.isValid(assignedUser)) {
                    return res.status(400).json({ message: 'assignedUser is not a valid user id', data: [] });
                }
                var owner = await User.findById(assignedUser);
                if (!owner) {
                    return res.status(404).json({ message: 'The assigned user does not exist', data: [] });
                }
                if (req.body.assignedUserName !== undefined && req.body.assignedUserName !== owner.name) {
                    return res.status(400).json({ message: 'assignedUserName does not match the assigned user', data: [] });
                }
                assignedUserName = owner.name;
            }

            var previousUser = task.assignedUser;

            task.name = name;
            task.description = description;
            task.deadline = when;
            task.completed = completed;
            task.assignedUser = assignedUser;
            task.assignedUserName = assignedUserName;
            await task.save();

            // the task left its old owner, so it is not pending for them anymore
            if (previousUser !== '' && previousUser !== assignedUser && mongoose.Types.ObjectId.isValid(previousUser)) {
                await User.updateOne({ _id: previousUser }, { $pull: { pendingTasks: task._id.toString() } });
            }

            // a completed task stays assigned but is not pending
            if (assignedUser !== '') {
                if (completed) {
                    await User.updateOne({ _id: assignedUser }, { $pull: { pendingTasks: task._id.toString() } });
                } else {
                    await User.updateOne({ _id: assignedUser }, { $addToSet: { pendingTasks: task._id.toString() } });
                }
            }

            res.status(200).json({ message: 'Task updated', data: task });
        } catch (err) {
            res.status(500).json({ message: 'Could not update the task', data: [] });
        }
    });

    tasksIdRoute.delete(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }
            var task = await Task.findByIdAndDelete(req.params.id);
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }

            if (task.assignedUser !== '' && mongoose.Types.ObjectId.isValid(task.assignedUser)) {
                await User.updateOne({ _id: task.assignedUser }, { $pull: { pendingTasks: task._id.toString() } });
            }

            res.status(204).send();
        } catch (err) {
            res.status(500).json({ message: 'Could not delete the task', data: [] });
        }
    });

    return router;
};
