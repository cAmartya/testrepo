const core = require("@actions/core");
const github = require("@actions/github");
const {Issue, IssueComment} = require('singleton')

// verifies if the current commenter is a member of the triage-team
function verifyTriageTeam(){
    const triageTeamUsernames = core.getInput("triage-team-usernames").split(",");
    const actor = github.context.actor;
    return triageTeamUsernames.includes(actor);
}

/**
 * This function will be only run if
 * - Event is `issue_comment` and action is `created`
 * - The messgae is `/assign`
 * - The issue is not closed
 *
 * This function will:
 * - `/assign @user1` : Can only be used by core-members of the organization. Assigns the issue to user1 
 * - `/assign` : Assign the issue to the commenter
 * - prevent new assignees, if the MAX_ASSIGNEE has been reached
 * 
 *
 * @export
 * @typedef {import('@octokit/core').Octokit & import("@octokit/plugin-rest-endpoint-methods/dist-types/types").Api & { paginate: import("@octokit/plugin-paginate-rest").PaginateInterface; }} octokit
 * @param {octokit} octokit - Octokit instance
 * @returns {Promise<void>}
 */

async function slash_assign( octokit ) {

    const issue = await Issue.getInstance();
    if (issue.actions_payload.state == "closed") {
        core.info("Issue is closed, no action needed");
        return;
    }
    if (github.context.eventName === "issue_comment" && github.context.payload.action === "created") {
        const issue_comment = await IssueComment.getInstance();
        issue_comment_body = (issue_comment.details.body ?? "").trim();
        if((issue_comment_body).trim().startswith("/assign")) {
            const max_assignee_count = core.getInput("max-assignee-count", { required: true });
            const current_assignee_count = issue.assignees.length;
            const remaining_assignees = max_assignee_count - current_assignee_count;
            if(remaining_assignees < 1) return;

            if(issue_comment_body === "/assign") {
                // self-assign
                try {
                    const res = await octokit.rest.issues.addAssignees({
                        owner: github.context.payload.repository.owner.login,
                        repo: github.context.payload.repository.name,
                        issue_number: issue.actions_payload.number,
                        assignees: [github.context.actor]
                    });

                    if(res.status === 200) {
                        core.info("User assigned to the issue");
                    } else {
                        core.setFailed("Failed to assign user to the issue");
                    }                                    
                } catch (error) {
                    core.setFailed(error.message);
                }
                return;
            }
            if(verifyTriageTeam()) {
                // assign to other contributors
                let assignees_to_add = issue_comment_body.substr(7).split("@").map(e => e.trim())
                assignees_to_add.shift()
                const fcfs_assignees_to_add = assignees_to_add.slice(0, remaining_assignees)

                try {
                    const res = await octokit.rest.issues.addAssignees({
                        owner: github.context.payload.repository.owner.login,
                        repo: github.context.payload.repository.name,
                        issue_number: issue.actions_payload.number,
                        assignees: fcfs_assignees_to_add
                    });

                    if(res.status === 200) {
                        core.info("User assigned to the issue");
                    } else {
                        core.setFailed("Failed to assign user to the issue");
                    }                                
                } catch (error) {
                    core.setFailed(error.message);
                }
            }    
        }
    }
}

module.exports = slash_assign;