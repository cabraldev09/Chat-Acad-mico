import api from "../services/api";

// The list of users answers 20 at a time: a selector (owner, member of a polo, filter) that reads only the first page
// cannot offer the older users. This reads every page; the answer has the same shape as one page ({ data: { users } }),
// so the screens that used the single call keep their code.
export const fetchAllUsers = async () => {
  let all = [];
  for (let page = 1; page <= 25; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await api.get("/users", { params: { pageNumber: page } });
    all = all.concat((data && data.users) || []);
    if (!data || !data.hasMore) break;
  }
  return all;
};

export const fetchAllUsersPage = async () => ({ data: { users: await fetchAllUsers() } });
