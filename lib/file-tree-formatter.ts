/**
 * Formats GitHub file tree data into a readable directory structure.
 */

interface FileTreeItem {
  path: string;
  type: string;
}

interface TreeNode {
  name: string;
  children: TreeNode[];
  isDirectory: boolean;
}

const createTreeNode = (name: string, isDirectory: boolean): TreeNode => ({
  name,
  children: [],
  isDirectory,
});

export const generateFileTree = (files: FileTreeItem[]): TreeNode => {
  const root: TreeNode = createTreeNode("root", true);

  for (const file of files) {
    addPathToTree(root, file.path, file.type === "tree");
  }

  return root;
};

const addPathToTree = (root: TreeNode, path: string, isDirectory: boolean): void => {
  const parts = path.split("/").filter((part) => part.length > 0);
  let currentNode = root;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const isLastPart = i === parts.length - 1;
    let child = currentNode.children.find((c) => c.name === part);

    if (!child) {
      child = createTreeNode(part, !isLastPart || isDirectory);
      currentNode.children.push(child);
    }

    currentNode = child;
  }
};

const sortTreeNodes = (node: TreeNode): void => {
  node.children.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name);
    }
    return a.isDirectory ? -1 : 1;
  });

  for (const child of node.children) {
    sortTreeNodes(child);
  }
};

export const treeToString = (node: TreeNode, prefix = "", isRoot = true): string => {
  sortTreeNodes(node);
  let result = "";

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!child) continue;

    const isLast = i === node.children.length - 1;
    const childPrefix = isRoot ? "" : `${prefix}${isLast ? "└── " : "├── "}`;
    const nextPrefix = isRoot ? "" : `${prefix}${isLast ? "    " : "│   "}`;

    result += `${childPrefix}${child.name}${child.isDirectory ? "/" : ""}\n`;

    if (child.isDirectory && child.children.length > 0) {
      result += treeToString(child, nextPrefix, false);
    }
  }

  return result;
};

export const generateTreeString = (files: FileTreeItem[]): string => {
  const tree = generateFileTree(files);
  return treeToString(tree).trim();
};

export const formatAsSimpleTree = (files: FileTreeItem[], repoName: string): string => {
  const treeString = generateTreeString(files);
  return `${repoName}/\n${treeString}`;
};

export const filterByPaths = (files: FileTreeItem[], paths: string[]): FileTreeItem[] => {
  if (!paths || paths.length === 0) {
    return files;
  }

  const normalizedPaths = paths.map((p) => (p.endsWith("/") ? p.slice(0, -1) : p));

  return files.filter((file) => {
    return normalizedPaths.some((path) => {
      return file.path === path || file.path.startsWith(path + "/");
    });
  });
};

export const filterByDepth = (files: FileTreeItem[], maxDepth: number): FileTreeItem[] => {
  if (!maxDepth || maxDepth <= 0) {
    return files;
  }

  return files.filter((file) => {
    const depth = file.path.split("/").length;
    return depth <= maxDepth;
  });
};

export const formatAsFilteredTree = (
  files: FileTreeItem[],
  repoName: string,
  paths?: string[],
  maxDepth?: number
): string => {
  let filteredFiles = files;

  if (paths && paths.length > 0) {
    filteredFiles = filterByPaths(filteredFiles, paths);
  }

  if (maxDepth && maxDepth > 0) {
    filteredFiles = filterByDepth(filteredFiles, maxDepth);
  }

  const treeString = generateTreeString(filteredFiles);
  return `${repoName}/\n${treeString}`;
};
